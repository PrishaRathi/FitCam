import { Text, Pressable, View, Dimensions } from "react-native";
import Dropdown from '../components/Dropdown';
import Styles from "../styles";
import React, { useState } from 'react';

const HomeScreen = ({ navigation }) => {
	const [value, setValue] = useState("tricep_presses_left");
	const CAM_PREVIEW_HEIGHT = Dimensions.get('window').width / (3 / 4);

	return (
		<View>
			<Dropdown value={value} setValue={setValue}/>
			<Pressable onPress={() => navigation.navigate('Camera', { exerciseOption: value })} style={Styles.homeButton}>
				<Text style={Styles.text}>Start Workout</Text>
			</Pressable>
			<Pressable onPress={() => navigation.navigate('Recordings')} style={Styles.homeButton}>
				<Text style={Styles.text}>View Recordings</Text>
			</Pressable>
		</View>
	);
}

export default HomeScreen;