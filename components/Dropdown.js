import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';
import AntDesign from '@expo/vector-icons/AntDesign';

const data = [
  { label: 'Tricep Presses - Left', value: 'tricep_presses_left' },
  { label: 'Tricep Presses - Right', value: 'tricep_presses_right' },
  { label: 'Seated Leg Extension - Left', value: 'seated_leg_extension_left' },
  { label: 'Seated Leg Extension - Right', value: 'seated_leg_extension_right' },
  { label: 'Leg Lift - Left', value: 'leg_lift_left' },
  { label: 'Leg Lift - Right', value: 'leg_lift_right' },
  { label: 'Good Mornings', value: 'good_morning' },
  { label: 'Hyperextensions', value: 'hyperextensions' },
  { label: 'Deadlifts', value: 'deadlifts' },
  { label: 'Seated Dumbbell Curl - Left', value: 'seated_dumbbell_curl_left' },
  { label: 'Seated Dumbbell Curl - Right', value: 'seated_dumbbell_curl_right' },
  { label: 'Dumbbell Kickback - Left', value: 'dumbbell_kickback_left' },
  { label: 'Dumbbell Kickback - Right', value: 'dumbbell_kickback_right' },
  { label: 'Sit-ups', value: 'sit_ups' },
  { label: 'Squats', value: 'squats' },
];

const DropdownComponent = ({ value, setValue }) => {
  const [isFocus, setIsFocus] = useState(false);

  return (
    <View style={styles.container}>
        <Text>Choose Workout</Text>
        <Dropdown
            style={[styles.dropdown, isFocus && { borderColor: 'blue' }]}
            placeholderStyle={styles.placeholderStyle}
            selectedTextStyle={styles.selectedTextStyle}
            inputSearchStyle={styles.inputSearchStyle}
            iconStyle={styles.iconStyle}
            data={data}
            search
            maxHeight={300}
            labelField="label"
            valueField="value"
            placeholder={!isFocus ? 'Select Workout' : '...'}
            searchPlaceholder="Search..."
            value={value}
            onFocus={() => setIsFocus(true)}
            onBlur={() => setIsFocus(false)}
            onChange={item => { setValue(item.value); setIsFocus(false); }}
            renderLeftIcon={() => (
            <AntDesign
                style={styles.icon}
                color={isFocus ? 'blue' : 'black'}
                name="Safety"
                size={20}
            />
            )}
        />
    </View>
  );
};

export default DropdownComponent;

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    padding: 16,
    marginBottom: 20,
  },
  dropdown: {
    height: 50,
    borderColor: 'gray',
    borderWidth: 0.5,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  icon: {
    marginRight: 5,
  },
  label: {
    position: 'absolute',
    backgroundColor: 'white',
    left: 22,
    top: 8,
    zIndex: 999,
    paddingHorizontal: 8,
    fontSize: 14,
  },
  placeholderStyle: {
    fontSize: 16,
  },
  selectedTextStyle: {
    fontSize: 16,
  },
  iconStyle: {
    width: 20,
    height: 20,
  },
  inputSearchStyle: {
    height: 40,
    fontSize: 16,
  },
});