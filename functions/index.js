const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// Test function to verify connectivity
exports.testConnection = functions.https.onCall(async (data, context) => {
  console.log("=== testConnection called ===");
  console.log("Auth exists:", !!context.auth);
  console.log("Auth UID:", context.auth?.uid);
  return {
    success: true,
    message: "Connection successful",
    authenticated: !!context.auth,
    uid: context.auth?.uid || null,
    timestamp: new Date().toISOString(),
  };
});

exports.addUser = functions.https.onCall(async (data, context) => {
  try {
    // Extract actual data and auth from nested structure
    const actualData = data.data || data;
    const actualAuth = data.auth || context.auth;

    // Check authentication
    if (!actualAuth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to create users.",
      );
    }

    const authenticatedUid = actualAuth.uid;
    const callerClaims = actualAuth.token || actualAuth;

    if (!authenticatedUid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to create users.",
      );
    }

    // Check role-based permissions
    const userRoleToAdd = actualData.user_role.toLowerCase();

    // Permission checks:
    // - SuperAdmins can add anyone
    // - Admins can add supervisors, agents, and customers
    // - Supervisors can add agents and customers
    // - Agents can add customers only

    const isSuperAdmin = callerClaims.superadmin === true;
    const isAdmin = callerClaims.admin === true;
    const isSupervisor = callerClaims.supervisor === true;
    const isAgent = callerClaims.agent === true;

    let hasPermission = false;

    if (isSuperAdmin) {
      hasPermission = true;
    } else if (isAdmin) {
      hasPermission = ["supervisor", "agent", "customer"].includes(
        userRoleToAdd,
      );
    } else if (isSupervisor) {
      hasPermission = ["agent", "customer"].includes(userRoleToAdd);
    } else if (isAgent) {
      hasPermission = userRoleToAdd === "customer";
    }

    if (!hasPermission) {
      throw new functions.https.HttpsError(
        "permission-denied",
        `You do not have permission to create ${userRoleToAdd} users.`,
      );
    }

    // Create the user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: actualData.email,
      password: actualData.password,
      displayName: actualData.name,
      ...(actualData.phone && { phoneNumber: actualData.phone }),
    });

    // Set custom claims (roles)
    const customClaims = {};
    customClaims[actualData.user_role.toLowerCase()] = true;

    await admin.auth().setCustomUserClaims(userRecord.uid, customClaims);

    // Create user document in Firestore
    await admin
      .firestore()
      .collection("users")
      .doc(userRecord.uid)
      .set({
        name: actualData.name,
        email: actualData.email,
        role: actualData.user_role,
        organisation: actualData.organisation,
        phone: actualData.phone,
        gender: actualData.gender,
        address: actualData.address,
        added_by_uid: actualData.added_by_uid,
        added_by_name: actualData.added_by_name,
        addedOn: actualData.addedOn,
        meta: {
          added_by_uid: actualData.added_by_uid,
          added_by_name: actualData.added_by_name,
          gender: actualData.gender,
          phone: actualData.phone,
          address: actualData.address,
        },
      });

    return {
      success: true,
      uid: userRecord.uid,
      message: "User created successfully",
    };
  } catch (error) {
    console.error("Error in addUser:", error.message);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// List all users function
exports.listUsers = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to list users.",
      );
    }

    // Get all users from Firestore
    const usersSnapshot = await admin.firestore().collection("users").get();
    const users = [];

    usersSnapshot.forEach((doc) => {
      users.push({
        uid: doc.id,
        ...doc.data(),
      });
    });

    return {
      success: true,
      users: users,
      count: users.length,
    };
  } catch (error) {
    console.error("Error listing users:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// Delete user function
exports.deleteUser = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to delete users.",
      );
    }

    const { uid } = data;
    if (!uid) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "User UID is required.",
      );
    }

    // Delete from Firebase Auth
    await admin.auth().deleteUser(uid);

    // Delete from Firestore
    await admin.firestore().collection("users").doc(uid).delete();

    return {
      success: true,
      message: "User deleted successfully",
    };
  } catch (error) {
    console.error("Error deleting user:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// Update user function
exports.updateUser = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to update users.",
      );
    }

    const { uid, ...updateData } = data;
    if (!uid) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "User UID is required.",
      );
    }

    // Update Firebase Auth if email or displayName changed
    const authUpdates = {};
    if (updateData.email) authUpdates.email = updateData.email;
    if (updateData.name) authUpdates.displayName = updateData.name;
    if (updateData.phone) authUpdates.phoneNumber = updateData.phone;

    if (Object.keys(authUpdates).length > 0) {
      await admin.auth().updateUser(uid, authUpdates);
    }

    // Update custom claims if role changed
    if (updateData.user_role) {
      const customClaims = {};
      customClaims[updateData.user_role.toLowerCase()] = true;
      await admin.auth().setCustomUserClaims(uid, customClaims);
    }

    // Update Firestore document
    await admin.firestore().collection("users").doc(uid).update(updateData);

    return {
      success: true,
      message: "User updated successfully",
    };
  } catch (error) {
    console.error("Error updating user:", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError("internal", error.message);
  }
});
