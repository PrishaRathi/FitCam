import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View } from "react-native";
import HomeScreen from "./app/HomeScreen";
import Styles from "./styles";
import PoseScreen from "./app/PoseScreen";
import RecordingsScreen from "./app/RecordingsScreen";
import React from 'react';
import VideoPlaybackScreen from "./app/VideoPlaybackScreen";

const Stack = createNativeStackNavigator();

const App = () => {

  return (
    <View style={Styles.container}>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Camera" component={PoseScreen} />
          <Stack.Screen name="Recordings" component={RecordingsScreen} options={{title: 'My Recordings'}} />
          <Stack.Screen name="PlaybackScreen" component={VideoPlaybackScreen} options={{title: 'Recording Playback'}}/>
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
};

export default App;
