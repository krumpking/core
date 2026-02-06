const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.addUser = functions.https.onCall(async (data, context) => {
  try {
    // Log incoming request for debugging
    console.log("addUser called with data:", JSON.stringify(data));
    console.log("Context:", JSON.stringify(context));
    console.log("Context auth:", JSON.stringify(context.auth));
    console.log("Context auth uid:", context.auth?.uid);
    console.log("Context.auth exists?", !!context.auth);

    // TEMPORARY: Comment out auth check for debugging
    // TODO: Re-enable this check after debugging
    /*
    if (!context.auth) {
      console.error("No authentication context found");
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated to create users. Please ensure you are logged in.",
      );
    }
    */
    
    if (context.auth) {
      console.log("User authenticated:", context.auth.uid);
    } else {
      console.warn("WARNING: Proceeding without authentication context - FOR TESTING ONLY");
    }

    // Create the user in Firebase Auth
    console.log("Creating user with email:", data.email);
    const userRecord = await admin.auth().createUser({
      email: data.email,
      password: data.password,
      displayName: data.name,
      ...(data.phone && { phoneNumber: data.phone }), // Only add if phone exists
    });

    console.log("User created with UID:", userRecord.uid);

    // Set custom claims (roles)
    const customClaims = {};
    customClaims[data.user_role.toLowerCase()] = true;

    await admin.auth().setCustomUserClaims(userRecord.uid, customClaims);

    // Create user document in Firestore
    await admin
      .firestore()
      .collection("users")
      .doc(userRecord.uid)
      .set({
        name: data.name,
        email: data.email,
        role: data.user_role,
        organisation: data.organisation,
        phone: data.phone,
        gender: data.gender,
        address: data.address,
        added_by_uid: data.added_by_uid,
        added_by_name: data.added_by_name,
        addedOn: data.addedOn,
        meta: {
          added_by_uid: data.added_by_uid,
          added_by_name: data.added_by_name,
          gender: data.gender,
          phone: data.phone,
          address: data.address,
        },
      });

    return {
      success: true,
      uid: userRecord.uid,
      message: "User created successfully",
    };
  } catch (error) {
    console.error("Error creating user:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});
