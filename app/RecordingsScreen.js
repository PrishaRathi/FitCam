import React, { useEffect, useState } from 'react'
import { View, Text, Button, StyleSheet, FlatList, TouchableHighlight } from 'react-native'
import Styles from "../styles";

import { listFileMetadata } from './utils/FirebaseUtils';
import { TouchableOpacity } from 'react-native';

const RecordingsScreen = ({ navigation }) => {
    const [recordings, setRecordings] = useState([]);

    // Get recordings from firebase
    useEffect(() => {
      console.log("Getting recordings from firebase");
      listFileMetadata(setRecordings);
    }, [])

    return (
      <View>
        <FlatList 
          data={recordings}
          keyExtractor={(item) => item.name}
          renderItem={({ item }) => <VideoTile video={item} navigation={navigation}/>}
        />
      </View>
    )

}

const VideoTile = ({ video, navigation }) => {
  return (
    <TouchableOpacity onPress={() => {
      navigation.navigate('PlaybackScreen', { video: video });
    }}>
      <View style={styles.tile}>
        <Text style={styles.tileText}>
          {new Date(video.timeCreated).toLocaleString()}
        </Text>
      </View>    
    </TouchableOpacity>
  )
}

export default RecordingsScreen;

const styles = StyleSheet.create({
    tile: {
        backgroundColor: 'white',
        padding: 15,
        marginVertical: 5,
        elevation: 1,
        // borderColor: 'black',
        // borderWidth: 1,
        borderRadius: 5,
    },
    tileText: {
      fontSize: 16,
    }
});