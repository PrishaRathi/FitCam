import { initializeApp } from 'firebase/app';
import * as FileSystem from 'expo-file-system';

// Optionally import the services that you want to use
import { getStorage, ref, uploadBytesResumable, getDownloadURL, listAll, getMetadata, list } from "firebase/storage";

// Initialize Firebase
// apparently it's safe to commit the api key: https://stackoverflow.com/a/37484053
const firebaseConfig = {
  apiKey: "AIzaSyACe-J7t12V-Jp_oVgsCpLnh3o2HGX3JzE",
  authDomain: "fitcam.firebaseapp.com",
  projectId: "fitcam",
  storageBucket: "fitcam.appspot.com",
  messagingSenderId: "1010889685722",
  appId: "1:1010889685722:web:8c6652c906cf20411483e3",
  measurementId: "G-5RK39KQP2K"
};

const app = initializeApp(firebaseConfig);

export const uploadToFirebase = (uri, name, onProgress) => {
  tryUploadToFirebase(uri, name, onProgress, 0);
}; 

export const uploadToFirebaseAsync = (uri, name, onProgress) => {
  return (async () => { uploadToFirebase(uri, name, onProgress) })();
}

const MAX_UPLOAD_RETRIES = 3

const tryUploadToFirebase = (uri, name, onProgress, i) => {
  if (i >= MAX_UPLOAD_RETRIES) {
    console.log("Failed uploading to firebase after", num_retries, "attempts")
    return
  }

  console.log("Uploading to firebase, attempt", i + 1)
  tryUploadToFirebaseAsync(uri, name, onProgress).then(
    (response) => {
      console.log("Success uploading to firebase", response);
    }
  ).catch(
    (error) => {
      console.log("Error uploading to firebase", error);
      tryUploadToFirebase(uri, name, onProgress, i + 1)
    }
  );
}

export const tryUploadToFirebaseAsync = async (uri, name, onProgress) => {
  const fetchResponse = await fetch(uri);
  const theBlob = await fetchResponse.blob();

  const recordingRef = ref(getStorage(), `recordings/${name}`);

  const uploadTask = uploadBytesResumable(recordingRef, theBlob);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress =
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress && onProgress(progress);
      },
      (error) => {
        // Handle unsuccessful uploads
        console.log(error);
        reject(error);
      },
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        resolve({
          downloadUrl,
          metadata: uploadTask.snapshot.metadata,
        });
      }
    );
  });
};

export const listFileMetadata = (onSuccess) => {
  const listRef = ref(getStorage(), `recordings`);
  list(listRef, {maxResults: 50})
    .then(async (res) => {
      let data = await Promise.all(res.items.map(async (item) => {
        try {
          return await getMetadata(item);
        } catch(error) {
          console.log("Error getting metadata", error);
        }
      }));
      onSuccess(data);
    })
    .catch((error) => {
      console.log("Error listing recordings", error);
    });
};

export const donwloadFromFirebase = (path, setFileUri) => {
  getDownloadURL(ref(getStorage(), path))
    .then((url) => {
      console.log("Download URL", url);
      const downloadInstance = FileSystem.createDownloadResumable(
        url,
        FileSystem.cacheDirectory + "/recording.mp4"
      );

      downloadInstance.downloadAsync()
        .then(({ uri }) => {
          console.log("Finished downloading to", uri);
          setFileUri(uri);
        })
        .catch((error) => {
          console.log("Error downloading", error);
        })
    
    })
    .catch((error) => {
      console.log("Error downloading from firebase", error);
    })
};
