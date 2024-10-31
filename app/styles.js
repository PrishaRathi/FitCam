import { StyleSheet } from "react-native";

const Styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	camera: {
		flex: 1,
	},
	buttonContainer: {
		flex: 1,
		backgroundColor: "transparent",
		flexDirection: "row",
		margin: 20,
	},
	cameraButton: {
		flex: 0.1,
		alignSelf: "flex-end",
		alignItems: "center",
	},
	text: {
		fontSize: 18,
		color: "white",
		lineHeight: 21,
    fontWeight: 'bold',
    letterSpacing: 0.25,
	},
	homeScreen: {
		// Put the contents of the screen (the button) in the middle
		display: "flex",
		flexDirection: "column",
		justifyContent: "center",
		alignItems: "center",
	},
	homeButton: {
		display: "flex",
		alignSelf: "center",	
		alignItems: "center",
		justifyContent: "center",
		width: "50%",
		padding: 20,
		borderRadius: 15,
		backgroundColor: '#000000',
		shadowColor: "#000",
		shadowOffset: {
			width: 0,
			height: 9,
		},
		shadowOpacity: 0.50,
		shadowRadius: 12.35,
		marginBottom: 20,
		// elevation: 19,
	},
});

export default Styles;