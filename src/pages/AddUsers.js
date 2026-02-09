import "../assets/styles/addClients.css";
import { httpsCallable } from "firebase/functions";
import { authentication, db, functions } from "../helpers/firebase";
import { useEffect, useState } from "react";
import { Form, Row, Col } from "react-bootstrap";
import Upload from "../components/uploader/Upload";
import Header from "../components/header/Header";
import { useForm } from "../hooks/useForm";
import useAuth from "../contexts/Auth";
import Loader from "../components/Loader";
import PasswordGenerator from "../components/PasswordGenerator";

import { collection, addDoc } from "firebase/firestore";
import { toast } from "react-toastify";
import { getDocs } from "firebase/firestore";
import { getUsers } from "../helpers/helpfulUtilities";
//email
import React, { useRef } from "react";
import emailjs from "@emailjs/browser";
// firebase storage..
import { ref, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { storage } from "../helpers/firebase";
import { async } from "@firebase/util";

function AddUsers({ role }) {
  const { authClaims } = useAuth();

  // Initialize the callable function
  const addUser = httpsCallable(functions, "addUser");

  const form = useRef();

  useEffect(() => {
    document.title = "Add Users | Core Insurance Management";
    if (!authClaims.agent && role !== "Customer") {
      getOrganisations();
      // getSupervisors();
    }
  }, []);
  const organisationsCollectionRef = collection(db, "organisations");

  const [comprehensive, setComprehensive] = useState(false);
  const [windscreen, setWindscreen] = useState(false);
  const [mtp, setMTP] = useState(false);
  const [newImport, setNewImport] = useState(false);
  const [transit, setTransit] = useState(false);
  const [supervisor, setSupervisor] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState("89900");
  const [isFormValid, setIsFormValid] = useState(false);

  // const [showOrganisation, setShowOrganisation] = useState(false)
  const [policyType, setPolicyType] = useState("");
  const [clientType, setClientType] = useState("individual");

  // initialising the logs doc.
  const logCollectionRef = collection(db, "logs");
  const [logo, setLogo] = useState(null);
  const [organisations, setOrganisations] = useState([]);
  const [supervisors, setSupervisors] = useState([]);

  const createPassword = () => {
    const characterList =
      "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!^+%&=?#$*@";

    let password = "";
    const characterListLength = characterList.length;
    for (let i = 0; i < 12; i++) {
      const characterIndex = Math.round(Math.random() * characterListLength);
      password = password + characterList.charAt(characterIndex);
    }
    return password;
  };

  useEffect(() => {
    setPassword(createPassword());
  }, []);

  const getOrganisations = async () => {
    const data = await getDocs(organisationsCollectionRef);
    const organisationArray = data.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    }));
    organisationArray.length === 0
      ? setOrganisations(null)
      : setOrganisations(organisationArray);
  };

  //Define email send

  const sendEmail = async (data) => {
    emailjs
      .send("service_gxb654m", "template_tn6pxkb", data, "zkWaW4gmtXvNtEUtU")
      .then(
        (result) => {
          console.log(result.text);
        },
        (error) => {
          console.log(error.text);
        },
      );
  };

  const getSupervisors = () => {
    getUsers("supervisor").then((result) => {
      result.length === 0 ? setSupervisors(null) : setSupervisors(result);
    });
  };

  const [fields, handleFieldChange] = useForm({
    user_role: ["client", "customer", "Customer"].includes(role)
      ? "Customer"
      : role,
    organisation: "",
    email: "",
    name: "",
    dob: "",
    gender: "",
    phone: "",
    address: "",
    licenseNo: "",
    NIN: "",
    photo: "",
  });

  // Validate form based on role and required fields
  useEffect(() => {
    const validateForm = () => {
      // Common required fields
      if (!fields.name || !fields.phone) {
        return false;
      }

      // Role-specific validation
      if (role === "supervisor") {
        if (!fields.organisation || !fields.gender) {
          return false;
        }
      }

      if (role === "agent") {
        if (!fields.gender) {
          return false;
        }
        // If admin is adding agent, supervisor must be selected
        if (authClaims.admin && !supervisor) {
          return false;
        }
      }

      if (role === "client" || role === "customer" || role === "Customer") {
        if (authClaims.agent || authClaims.supervisor) {
          if (!policyType) {
            return false;
          }
        }
        if (policyType === "comprehensive" && !fields.gender) {
          return false;
        }
      }

      return true;
    };

    setIsFormValid(validateForm());
  }, [fields, role, supervisor, policyType, authClaims]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      const currentUser = authentication.currentUser;
      if (!currentUser) {
        toast.error("You must be logged in to perform this action", {
          position: "top-center",
        });
        setIsLoading(false);
        return;
      }

      if (comprehensive) fields["comprehensive"] = true;
      if (mtp) fields["mtp"] = true;
      if (windscreen) fields["windscreen"] = true;
      if (newImport) fields["newImport"] = true;
      if (transit) fields["transit"] = true;

      fields["added_by_uid"] = authentication.currentUser.uid;
      fields["added_by_name"] = authentication.currentUser.displayName;
      fields["password"] = password;
      fields["addedOn"] = `${new Date()
        .toISOString()
        .slice(
          0,
          10,
        )} ${new Date().getHours()}:${new Date().getMinutes()}:${new Date().getSeconds()}`;

      if (role === "agent" && authClaims.admin) {
        fields["supervisor"] = supervisor;
      }

      if (logo) {
        const storageRef = ref(storage, `images/${logo.name}`);
        const uploadTask = uploadBytesResumable(storageRef, logo);

        uploadTask.on(
          "state_changed",
          (snapshot) => {
            const prog =
              Math.round(snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setProgress(prog);
          },
          (error) => console.log(error),
          async () => {
            await getDownloadURL(uploadTask.snapshot.ref)
              .then((downloadUrl) => {
                fields.photo = downloadUrl;
              })
              .then(async () => {
                addUser(fields)
                  .then(async (results) => {
                    toast.success(`Successfully added ${fields.name}`, {
                      position: "top-center",
                    });
                    const email_data = {
                      name: fields.name,
                      username: fields.email,
                      password: fields.password,
                      to: fields.email,
                    };
                    if (role != "Customer") {
                      sendEmail(email_data);
                    }

                    setIsLoading(false);
                    document.form3.reset();
                  })
                  .then(async () => {
                    await addDoc(logCollectionRef, {
                      timeCreated: `${new Date()
                        .toISOString()
                        .slice(
                          0,
                          10,
                        )} ${new Date().getHours()}:${new Date().getMinutes()}:${new Date().getSeconds()}`,
                      type: "user creation",
                      status: "successful",
                      message: `Successfully created ${fields.user_role} - [ ${fields.name} ] by ${authentication.currentUser.displayName}`,
                    });
                    setPassword("");
                    setLogo("");
                  })
                  .catch(async (error) => {
                    console.error("Error adding user:", error.message);

                    let errorMessage =
                      error.message || "Unknown error occurred";

                    if (
                      error.code === "unauthenticated" ||
                      error.message?.includes("authenticated")
                    ) {
                      errorMessage =
                        "Authentication failed. Please log out and log back in.";
                    }

                    toast.error(
                      `Failed to add ${fields.name}: ${errorMessage}`,
                      {
                        position: "top-center",
                        autoClose: 5000,
                      },
                    );

                    await addDoc(logCollectionRef, {
                      timeCreated: `${new Date()
                        .toISOString()
                        .slice(
                          0,
                          10,
                        )} ${new Date().getHours()}:${new Date().getMinutes()}:${new Date().getSeconds()}`,
                      type: "user creation",
                      status: "failed",
                      message: `Failed to create ${fields.user_role} - [ ${fields.name} ] by ${authentication.currentUser.displayName}. Error: ${errorMessage}`,
                    });

                    setPassword("");
                    setLogo("");
                    setIsLoading(false);
                  });
              });
          },
        );
      } else {
        addUser(fields)
          .then(async (results) => {
            toast.success(`Successfully added ${fields.name}`, {
              position: "top-center",
            });
            const email_data = {
              name: fields.name,
              username: fields.email,
              password: fields.password,
              to: fields.email,
            };
            if (role != "Customer") {
              sendEmail(email_data);
            }
            setIsLoading(false);
            document.form3.reset();
          })
          .then(async () => {
            await addDoc(logCollectionRef, {
              timeCreated: `${new Date()
                .toISOString()
                .slice(
                  0,
                  10,
                )} ${new Date().getHours()}:${new Date().getMinutes()}:${new Date().getSeconds()}`,
              type: "user creation",
              status: "successful",
              message: `Successfully created ${fields.user_role} - [ ${fields.name} ] by ${authentication.currentUser.displayName}`,
            });
            setPassword("");
          })
          .catch(async (error) => {
            console.error("Error adding user:", error.message);

            let errorMessage = error.message || "Unknown error occurred";

            if (
              error.code === "unauthenticated" ||
              error.message?.includes("authenticated")
            ) {
              errorMessage =
                "Authentication failed. Please log out and log back in.";
            }

            toast.error(`Failed to add ${fields.name}: ${errorMessage}`, {
              position: "top-center",
              autoClose: 5000,
            });

            await addDoc(logCollectionRef, {
              timeCreated: `${new Date()
                .toISOString()
                .slice(
                  0,
                  10,
                )} ${new Date().getHours()}:${new Date().getMinutes()}:${new Date().getSeconds()}`,
              type: "user creation",
              status: "failed",
              message: `Failed to create ${fields.user_role} - [ ${fields.name} ] by ${authentication.currentUser.displayName}. Error: ${errorMessage}`,
            });
            setIsLoading(false);
          });
      }
    } catch (error) {
      console.error("Unexpected error in handleSubmit:", error);
      toast.error("An unexpected error occurred. Please try again.", {
        position: "top-center",
      });
      setIsLoading(false);
    }
  };

  const [progress, setProgress] = useState(0);

  return (
    <div className="boom">
      <header className="tw-mx-5 tw-py-5">
        <div className="nk-block-between">
          <div className="header-txt">
            <h1 className="tw-text-lg md:tw-text-4xl tw-font-bold">{`Add ${role[0].toUpperCase() + role.slice(1).toLowerCase()}`}</h1>
            <p className="tw-text-sm tw-text-gray-500">{`Add a new ${role}`}</p>
          </div>
        </div>
      </header>

      <Header
        title={`Add ${role[0].toUpperCase() + role.slice(1).toLowerCase()}`}
        subtitle={`Add a new ${role}`.toUpperCase()}
      />
      <div className="addComponentsData shadow-sm mb-3">
        {isLoading && (
          <div className="loader-wrapper">
            <Loader />
          </div>
        )}
        <Form name="form3" ref={form} onSubmit={handleSubmit}>
          {role === "supervisor" && (
            <Row style={{ marginLeft: "0" }}>
              <Form.Group className="my-3 px-0 categories" width="200px">
                <Form.Label htmlFor="organisation">
                  Organisation<span className="required">*</span>
                </Form.Label>
                <Form.Select
                  aria-label="Organisation"
                  id="organisation"
                  onChange={handleFieldChange}
                  required
                >
                  <option value={""}>Organisation</option>
                  {organisations &&
                    organisations.length > 0 &&
                    organisations.map((organisation, index) => (
                      <option key={index}>{organisation?.name}</option>
                    ))}
                </Form.Select>
              </Form.Group>
            </Row>
          )}

          {role === "client" && authClaims.agent && (
            <Row style={{ marginLeft: "0" }}>
              <Form.Group className="my-3 px-0 categories" width="200px">
                <Form.Select
                  aria-label="User role"
                  id="category"
                  onChange={({ target: { value } }) => setPolicyType(value)}
                  required
                >
                  <option value={""}>Policy Type</option>
                  {authClaims.mtp && <option value="mtp">MTP</option>}
                  {authClaims.comprehensive && (
                    <option value="comprehensive">Comprehensive</option>
                  )}
                  {authClaims.windscreen && (
                    <option value="windscreen">Windscreen</option>
                  )}
                  {authClaims.newImports && (
                    <option value="newImport">New Imports</option>
                  )}
                  {authClaims.transit && (
                    <option value="transit">Transit</option>
                  )}
                </Form.Select>
              </Form.Group>
            </Row>
          )}

          {role === "client" && authClaims.supervisor && (
            <Row>
              <Form.Group className="m-3 categories" width="200px">
                <Form.Select
                  aria-label="User role"
                  id="category"
                  onChange={({ target: { value } }) => setPolicyType(value)}
                  required
                >
                  <option value={""}>Policy Type</option>
                  <option value="mtp">MTP</option>
                  <option value="comprehensive">Comprehensive</option>
                  <option value="windscreen">Windscreen</option>
                  <option value="newImport">New Imports</option>
                  <option value="transit">Transit</option>
                </Form.Select>
              </Form.Group>
            </Row>
          )}

          {role === "client" && policyType === "comprehensive" ? (
            <>
              <Form.Group className="m-3 categories" width="200px">
                <Form.Select
                  aria-label="User role"
                  id="category"
                  onChange={({ target: { value } }) => setClientType(value)}
                >
                  <option value={"individual"}>Type of Client</option>
                  <option value="individual">Individual</option>
                  <option value="corporateEntity">Corporate Entity</option>
                </Form.Select>
              </Form.Group>
              {clientType === "individual" && (
                <>
                  <Form.Group className="mb-3">
                    <Form.Label htmlFor="name">
                      Name<span className="required">*</span>
                    </Form.Label>
                    <Form.Control
                      id="name"
                      placeholder="Name"
                      onChange={handleFieldChange}
                      required
                    />
                  </Form.Group>
                  <Row className="mb-3">
                    <Form.Group
                      className="addFormGroups"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "start",
                      }}
                    >
                      <Form.Label htmlFor="email">Email Address</Form.Label>
                      <Form.Control
                        type="email"
                        id="email"
                        placeholder="Enter email"
                        onChange={handleFieldChange}
                      />
                    </Form.Group>

                    <Form.Group className="addFormGroups">
                      <Form.Label htmlFor="gender">
                        Gender <span className="required">*</span>
                      </Form.Label>
                      <div className="gender-options" required>
                        <div>
                          <input
                            type="radio"
                            name="gender"
                            id="gender"
                            value="male"
                            className="addFormRadio"
                            onChange={handleFieldChange}
                          />
                          <label htmlFor="male">Male</label>
                        </div>
                        <div>
                          <input
                            type="radio"
                            name="gender"
                            id="gender"
                            value="female"
                            className="addFormRadio"
                            onChange={handleFieldChange}
                          />
                          <label htmlFor="female">Female</label>
                        </div>
                      </div>
                    </Form.Group>
                  </Row>

                  <Row className="mb-3">
                    <Form.Group className="addFormGroups">
                      <Form.Label htmlFor="tinNumber">Tin Number</Form.Label>
                      <Form.Control
                        type="text"
                        id="tinNumber"
                        placeholder="Enter TIN"
                        onChange={handleFieldChange}
                      />
                    </Form.Group>
                    <Form.Group className="addFormGroups">
                      <Form.Label htmlFor="phone">
                        Phone Number <span className="required">*</span>
                      </Form.Label>
                      <Form.Control
                        type="tel"
                        id="phone"
                        placeholder="Enter phone number"
                        onChange={handleFieldChange}
                        required
                      />
                    </Form.Group>
                  </Row>

                  <Form.Group className="mb-3">
                    <Form.Label htmlFor="address">Address</Form.Label>
                    <Form.Control
                      id="address"
                      placeholder="Enter your address"
                      onChange={handleFieldChange}
                    />
                  </Form.Group>
                  <Row className="mb-3">
                    <Form.Group className="addFormGroups">
                      <Form.Label htmlFor="driverLicense">
                        Driver's License
                      </Form.Label>
                      <Form.Control
                        id="driverLicense"
                        placeholder="Driver's License"
                        onChange={handleFieldChange}
                      />
                    </Form.Group>
                    <Form.Group className="addFormGroups mb-3">
                      <Form.Label htmlFor="nin">NIN</Form.Label>
                      <Form.Control
                        id="NIN"
                        placeholder="NIN"
                        onChange={handleFieldChange}
                      />
                    </Form.Group>
                  </Row>
                  {/* <Form.Label htmlFor='upload'>Upload Profile photo</Form.Label>
                                        <Upload setLogo={setLogo}/> */}
                </>
              )}
              {clientType === "corporateEntity" && (
                <>
                  <Form.Group className="mb-3">
                    <Form.Label htmlFor="name">
                      Name<span className="required">*</span>
                    </Form.Label>
                    <Form.Control
                      id="name"
                      placeholder="Name"
                      onChange={handleFieldChange}
                      required
                    />
                  </Form.Group>
                  <Row>
                    <Form.Group
                      className="addFormGroups"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "start",
                      }}
                    >
                      <Form.Label htmlFor="email">Email Address</Form.Label>
                      <Form.Control
                        type="email"
                        id="email"
                        placeholder="Enter email"
                        onChange={handleFieldChange}
                      />
                    </Form.Group>
                  </Row>
                  <Row className="mb-3">
                    <Form.Group className="addFormGroups">
                      <Form.Label htmlFor="tinNumber">Tin Number</Form.Label>
                      <Form.Control
                        type="text"
                        id="tinNumber"
                        placeholder="Enter TIN"
                        onChange={handleFieldChange}
                      />
                    </Form.Group>
                    <Form.Group className="addFormGroups">
                      <Form.Label htmlFor="phone">
                        Phone Number <span className="required">*</span>
                      </Form.Label>
                      <Form.Control
                        type="tel"
                        id="phone"
                        placeholder="Enter phone number"
                        onChange={handleFieldChange}
                        required
                      />
                    </Form.Group>
                  </Row>
                  <Form.Group className="mb-3">
                    <Form.Label htmlFor="address">Address</Form.Label>
                    <Form.Control
                      id="address"
                      placeholder="Enter your address"
                      onChange={handleFieldChange}
                    />
                  </Form.Group>
                </>
              )}
            </>
          ) : (
            <>
              {role === "agent" && authClaims.admin && (
                <Form.Group className="my-3 px-0 categories" width="200px">
                  <Form.Label htmlFor="name">Assign Supervisor</Form.Label>
                  <Form.Select
                    aria-label="User role"
                    id="category"
                    onChange={({ target: { value } }) => setSupervisor(value)}
                    required
                  >
                    <option value="">Name</option>
                    {supervisors &&
                      supervisors?.length > 0 &&
                      supervisors.map((option, index) => (
                        <option key={index} value={option.uid}>
                          {option.name}
                        </option>
                      ))}
                  </Form.Select>
                </Form.Group>
              )}
              <Form.Group className="mb-3">
                <Form.Label htmlFor="name">
                  Name<span className="required">*</span>
                </Form.Label>
                <Form.Control
                  id="name"
                  placeholder="Name"
                  onChange={handleFieldChange}
                  required
                />
              </Form.Group>
              <Row className="mb-3">
                <Form.Group
                  as={Col}
                  className="addFormGroups"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "start",
                  }}
                >
                  <Form.Label htmlFor="email">Email Address</Form.Label>
                  <Form.Control
                    type="email"
                    id="email"
                    placeholder="Enter email"
                    onChange={handleFieldChange}
                  />
                </Form.Group>
                <Form.Group
                  as={Col}
                  className="addFormGroups"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "start",
                  }}
                >
                  <Form.Label htmlFor="gender">
                    Gender <span className="required">*</span>
                  </Form.Label>
                  <div className="gender-options">
                    <div>
                      <input
                        type="radio"
                        name="gender"
                        id="gender"
                        value="male"
                        className="addFormRadio"
                        onChange={handleFieldChange}
                      />
                      <label htmlFor="male">Male</label>
                    </div>
                    <div>
                      <input
                        type="radio"
                        name="gender"
                        id="gender"
                        value="female"
                        className="addFormRadio"
                        onChange={handleFieldChange}
                      />
                      <label htmlFor="female">Female</label>
                    </div>
                  </div>
                </Form.Group>
              </Row>

              <Row className="mb-3">
                <Form.Group className="addFormGroups">
                  <Form.Label htmlFor="tinNumber">Tin Number</Form.Label>
                  <Form.Control
                    type="text"
                    id="tinNumber"
                    placeholder="Enter TIN"
                    onChange={handleFieldChange}
                  />
                </Form.Group>
                <Form.Group className="addFormGroups">
                  <Form.Label htmlFor="phone">
                    Phone Number <span className="required">*</span>
                  </Form.Label>
                  <Form.Control
                    type="tel"
                    id="phone"
                    placeholder="Enter phone number"
                    onChange={handleFieldChange}
                    required
                  />
                </Form.Group>
              </Row>
              <Form.Group className="mb-3">
                <Form.Label htmlFor="address">Address</Form.Label>
                <Form.Control
                  id="address"
                  placeholder="Enter your address"
                  onChange={handleFieldChange}
                />
              </Form.Group>
              <Row className="mb-3">
                <Form.Group className="addFormGroups">
                  <Form.Label htmlFor="license">License No.</Form.Label>
                  <Form.Control
                    id="licenseNo"
                    placeholder="license No."
                    onChange={handleFieldChange}
                  />
                </Form.Group>
                {/* <Form.Group as={Col} className="addFormGroups" >
                                            <Form.Label htmlFor='driverLicense'>Driver's License</Form.Label>
                                            <Form.Control id="driverLicense" placeholder="Driver's License" onChange={handleFieldChange} />
                                        </Form.Group> */}
              </Row>
              <Row>
                <Form.Group className="addFormGroups mb-3">
                  <Form.Label htmlFor="nin">NIN</Form.Label>
                  <Form.Control
                    id="NIN"
                    placeholder="NIN"
                    onChange={handleFieldChange}
                  />
                </Form.Group>
              </Row>

              {role === "agent" && (
                <>
                  <Form.Group className="mb-3">
                    <Form.Label htmlFor="agentcan">Agent Can?</Form.Label>
                  </Form.Group>
                  <Form.Group className="mb-3" controlId="comprehensive">
                    <Form.Check
                      type="checkbox"
                      label="Handle Comprehensive"
                      id="handle_comprehensive"
                      value={true}
                      onChange={(event) => setComprehensive(!comprehensive)}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3" controlId="mtp">
                    <Form.Check
                      type="checkbox"
                      label="Handle Motor Third Party"
                      id="handle_mtp"
                      value={true}
                      onChange={() => setMTP(!mtp)}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3" controlId="windscreen">
                    <Form.Check
                      type="checkbox"
                      label="Handle Windscreen"
                      id="handle_windscreen"
                      value={true}
                      onChange={() => setWindscreen(!windscreen)}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3" controlId="newImport">
                    <Form.Check
                      type="checkbox"
                      label="Handle New Imports"
                      id="handle_newImport"
                      value={true}
                      onChange={() => setNewImport(!newImport)}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3" controlId="transit">
                    <Form.Check
                      type="checkbox"
                      label="Handle Transit"
                      id="handle_transit"
                      value={true}
                      onChange={() => setTransit(!transit)}
                    />
                  </Form.Group>
                </>
              )}
              {role !== "client" && (
                <>
                  <Form.Label htmlFor="upload">Upload Profile photo</Form.Label>
                  <Upload setLogo={setLogo} />
                </>
              )}

              {role !== "client" && (
                <Form.Group className="addFormGroups">
                  <Form.Label htmlFor="password"></Form.Label>
                  <Form.Control
                    type="hidden"
                    id="password"
                    placeholder=""
                    value={password}
                  />
                </Form.Group>
              )}
            </>
          )}
          <div id="submit">
            <input
              type="submit"
              value="Submit"
              className="btn btn-dark cta submitcta"
              disabled={!isFormValid}
              style={{
                background: !isFormValid ? "rgba(20, 117, 207, 0.4)" : "",
                border: !isFormValid ? "1px solid #a1c8ec" : "",
                cursor: !isFormValid ? "not-allowed" : "pointer",
              }}
            />
          </div>
        </Form>
      </div>
    </div>
  );
}

export default AddUsers;
