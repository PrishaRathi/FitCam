import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { donwloadFromFirebase } from './utils/FirebaseUtils';
import { Video } from 'expo-av';

const VideoPlaybackScreen = ({navigation, route}) => {
  useEffect(() => { 
    donwloadFromFirebase(route.params.video.fullPath, setFileUri);
  }, []);

  const [fileUri, setFileUri] = useState(null);

  return (
    <View style={styles.videoContainer}>
      {!fileUri && <Text style={styles.loading}>Loading...</Text>}
      {fileUri && (
          <Video
            source={{ uri: fileUri }}
            style={styles.video}
            resizeMode="contain"
            useNativeControls
          />
        )}
    </View>
  );
}

export default VideoPlaybackScreen;

const styles = StyleSheet.create({
  videoContainer: {
    display: 'flex',
    justifyContent: 'center',
    flex: 1,
    padding: 0,
  },
  video: {
    width: '100%',
    height: '100%',
    margin: 0,
  },
  loading: {
    fontSize: 16,
    alignSelf: 'center',

  }
});