import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { getFirestore } from "@firebase/firestore";
import { getStorage } from "firebase/storage";

/*const firebaseConfig = {
    apiKey: process.env.REACT_APP_API_KEY,
    authDomain: process.env.REACT_APP_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_PROJECT_ID,
    storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_APP_ID,
    measurementId: process.env.REACT_APP_MEASUREMENT_ID
}*/

const firebaseConfig = {
  apiKey: "AIzaSyC_6jQN-yrgyDcwSccpf9jHPMrtTBZK3sI",
  authDomain: "fire-base-animal-guesser.firebaseapp.com",
  databaseURL: "https://fire-base-animal-guesser.firebaseio.com",
  projectId: "fire-base-animal-guesser",
  storageBucket: "fire-base-animal-guesser.appspot.com",
  messagingSenderId: "464928249078",
  appId: "1:464928249078:web:3db78a6c4d3af7d01008d7",
};

const app = initializeApp(firebaseConfig);

export const authentication = getAuth(app);
// Ensure functions use the same app instance and default region (us-central1)
export const functions = getFunctions(app, "us-central1");

export const db = getFirestore(app);

export const storage = getStorage(app);

export function onAuthStateChange(
  userCallback,
  claimsCallback,
  loadingCallback = null,
) {
  if (loadingCallback) loadingCallback(true);

  return onAuthStateChanged(authentication, (user) => {
    if (user) {
      return authentication.currentUser
        .getIdTokenResult()
        .then((idTokenResult) => {
          claimsCallback(idTokenResult.claims);
          userCallback({ loggedIn: true, ...user });
          if (loadingCallback) loadingCallback(false);
        })
        .catch((error) => {
          console.error(error);
          if (loadingCallback) loadingCallback(false);
          return userCallback({ loggedIn: false });
        });
    } else {
      if (loadingCallback) loadingCallback(false);
      return userCallback({ loggedIn: false });
    }
  });
}
