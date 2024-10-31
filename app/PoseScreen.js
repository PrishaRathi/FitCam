import React, { useEffect, useState, useRef } from 'react';
import { Modal, StyleSheet, Text, View, Dimensions, Platform, TouchableOpacity, Pressable } from 'react-native';

import { Camera } from 'expo-camera';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import * as tf from '@tensorflow/tfjs';
import * as posedetection from '@tensorflow-models/pose-detection';
import * as ScreenOrientation from 'expo-screen-orientation';
import {
  bundleResourceIO,
  cameraWithTensors,
} from '@tensorflow/tfjs-react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { ExpoWebGLRenderingContext } from 'expo-gl';
import { CameraType } from 'expo-camera/build/Camera.types';
import poseData from '../data/poseData.json';

import * as FileSystem from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { uploadToFirebase, uploadToFirebaseAsync } from './utils/FirebaseUtils';

import * as Speech from 'expo-speech';

// tslint:disable-next-line: variable-name
const TensorCamera = cameraWithTensors(Camera);

const IS_ANDROID = Platform.OS === 'android';
const IS_IOS = Platform.OS === 'ios';

// Camera preview size.
//
// From experiments, to render camera feed without distortion, 16:9 ratio
// should be used fo iOS devices and 4:3 ratio should be used for android
// devices.
//
// This might not cover all cases.
const CAM_PREVIEW_WIDTH = Dimensions.get('window').width;
const CAM_PREVIEW_HEIGHT = CAM_PREVIEW_WIDTH / (IS_IOS ? 9 / 16 : 3 / 4);

// The score threshold for pose detection results.
const MIN_KEYPOINT_SCORE = 0.3;

// The size of the resized output from TensorCamera.
//
// For movenet, the size here doesn't matter too much because the model will
// preprocess the input (crop, resize, etc). For best result, use the size that
// doesn't distort the image.
const OUTPUT_TENSOR_WIDTH = 180;
const OUTPUT_TENSOR_HEIGHT = OUTPUT_TENSOR_WIDTH / (IS_IOS ? 9 / 16 : 3 / 4);

// Whether to auto-render TensorCamera preview.
const AUTO_RENDER = false;

// Whether to load model from app bundle (true) or through network (false).
const LOAD_MODEL_FROM_BUNDLE = false;

export default function PoseScreen({ navigation, route }) {
  const cameraRef = useRef(null);
  const [tfReady, setTfReady] = useState(false);
  const [model, setModel] = useState();
  const [poses, setPoses] = useState();
  const [fps, setFps] = useState(0);
  const [orientation, setOrientation] = useState();
  const [cameraType, setCameraType] = useState(Camera.Constants.Type.front);
  const [currentPoses, setCurrentPoses] = useState()
  const [modal, setModal] = useState(false)

  const [armAngle, setArmAngle] = useState();
  const [restState, setRestState] = useState(false);
  const [midState, setMidState] = useState(false);
  const [doneState, setDoneState] = useState(false);
  const [shoulderAngle, setShoulderAngle] = useState();
  const [Tips, setTips] = useState('');
  const [Mistakes, setMistakes] = useState('');

  const [reps, setReps] = useState(0);
  const handleResetReps = () => {
    setReps(0);
  };

  const [recording, setRecording] = useState(false);

  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [hasFilePermission, setHasFilePermission] = useState(false);
  const [recordingsPath, setRecordingsPath] = useState('');

  // -- Speech
  useEffect(() => {
    let speakInput = '';
    let exerciseData = poseData[route.params.exerciseOption];
    // -- Workout complete
    if (!midState && !restState && doneState) {
      speakInput = 'Exercise done successfully';
    }
    // -- Mid workout
    else if (midState && !restState && !doneState){
      speakInput = Mistakes;
    }
    // -- Rest Position
    else if(!midState && restState && !doneState){
      speakInput = 'Rest position reached';
    }

    let options = {
      onDone:() => Speech.stop()
    };
    Speech.speak(speakInput, options);
  }, [midState, restState, doneState]);

  const speakSuggestions = () => {
    const currentWorkout = route.params.exerciseOption;
    const musclesArray = poseData[currentWorkout].muscles;
    const muscles = musclesArray.length === 1 ? musclesArray[0] : musclesArray.length === 2 ? musclesArray.join(" or ") : musclesArray.slice(0, -1).join(", ") + ' or ' + musclesArray.slice(-1);
    const nextArray = poseData[currentWorkout].next;
    const next = nextArray.length === 1 ? nextArray[0] : nextArray.length === 2 ? nextArray.join(" or ") : nextArray.slice(0, -1).join(", ") + ' or ' + nextArray.slice(-1);

    speakInput = "Congrats on working " + muscles.toString() + " muscles. Consider doing " + next.toString() + " workouts next";
    let options = {
      onDone:() => Speech.stop()
    };
    Speech.speak(speakInput, options);
  }

  useEffect(() => {
    (async () => {
      try {
        // Camera
        const camPermissions = await Camera.requestCameraPermissionsAsync();
        if (camPermissions.granted) {
          setHasCameraPermission(true)
        }

        // Microphone
        const micPermissions = await Camera.requestMicrophonePermissionsAsync();
        if (micPermissions.granted) {
          setHasMicPermission(true);
        }

        // Recordings folder
        const mediaPermissions = await MediaLibrary.requestPermissionsAsync();
        if (mediaPermissions.granted) {
          setHasFilePermission(true);
        }
      }
      catch (err) {
        console.log(err);
      }
    })();
  }, [])

  // Use `useRef` so that changing it won't trigger a re-render.
  //
  // - null: unset (initial value).
  // - 0: animation frame/loop has been canceled.
  // - >0: animation frame has been scheduled.
  const rafId = useRef(null);
  useEffect(() => {
    if (poses && poses.length > 0) {
      handlePoses(poses[0]);
    }
  }, [poses]);

  const prevRestState = useRef(false);

  // useEffect hook to update prevRestState whenever restState changes
  useEffect(() => {
    prevRestState.current = restState;
  }, [restState]);

  useEffect(() => {
    if (doneState && prevRestState && !restState) {
      // Increment the rep counter only when transitioning from reset state to done state
      setReps(prevReps => prevReps + 1);
    }
  }, [doneState, restState, prevRestState]);

  useEffect(() => {
    async function prepare() {
      rafId.current = null;

      // Set initial orientation.
      const curOrientation = await ScreenOrientation.getOrientationAsync();
      setOrientation(curOrientation);

      // Listens to orientation change.
      ScreenOrientation.addOrientationChangeListener((event) => {
        setOrientation(event.orientationInfo.orientation);
      });

      // Camera permission.
      await Camera.requestCameraPermissionsAsync();

      // Wait for tfjs to initialize the backend.
      await tf.ready();

      // Load movenet model.
      // https://github.com/tensorflow/tfjs-models/tree/master/pose-detection
      const movenetModelConfig = {
        modelType: posedetection.movenet.modelType.SINGLEPOSE_THUNDER,
        enableSmoothing: true,
      };
      if (LOAD_MODEL_FROM_BUNDLE) {
        const modelJson = require('../offline_model/model.json');
        const modelWeights1 = require('../offline_model/group1-shard1of2.bin');
        const modelWeights2 = require('../offline_model/group1-shard2of2.bin');
        movenetModelConfig.modelUrl = bundleResourceIO(modelJson, [
          modelWeights1,
          modelWeights2,
        ]);
      }
      const model = await posedetection.createDetector(
        posedetection.SupportedModels.MoveNet,
        movenetModelConfig
      );
      setModel(model);

      // Ready!
      setTfReady(true);
    }

    prepare();
  }, []);

  useEffect(() => {
    // Called when the app is unmounted.
    return () => {
      if (rafId.current != null && rafId.current !== 0) {
        cancelAnimationFrame(rafId.current);
        rafId.current = 0;
      }
    };
  }, []);

  const handleCameraStream = async (
    images,
    updatePreview,
    gl
  ) => {
    const loop = async () => {
      // Get the tensor and run pose detection.
      const imageTensor = images.next().value;

      const startTs = Date.now();
      const poses = await model.estimatePoses(
        imageTensor,
        undefined,
        Date.now()
      );
      const latency = Date.now() - startTs;
      setFps(Math.floor(1000 / latency) + 20);
      setPoses(poses);
      tf.dispose([imageTensor]);

      if (rafId.current === 0) {
        return;
      }

      // Render camera preview manually when autorender=false.
      if (!AUTO_RENDER) {
        updatePreview();
        gl.endFrameEXP();
      }

      rafId.current = requestAnimationFrame(loop);
    };

    loop();
  };

  // ---------- ANALYSIS CALCULATIONS ---------- //
  const dist = (point_a, point_b) => Math.sqrt((point_a.x - point_b.x) ** 2 + (point_a.y - point_b.y) ** 2);

  // Get angle between three points in degrees
  const getAngle = (point1, point2, point3) => {
    // -- Get distance between p1 and p2
    let distance_12 = dist(point1, point2)
    // -- Get distance between p1 and p3
    let distance_13 = dist(point1, point3)
    // -- Get distance between p2 and p3
    let distance_23 = dist(point2, point3)

    // -- Cosine law
    let angle_rad = Math.acos((distance_12 ** 2 + distance_23 ** 2 - distance_13 ** 2) / (2 * distance_12 * distance_23))
    return angle_rad * 180 / Math.PI;
  }

  const handlePoses = (poses) => {
    // console.log('current body poses :', poses.keypoints)

    let points = new Map();
    if (poses && poses.keypoints && poses.keypoints.length > 0) {
      poses.keypoints.map((point) => points.set(point.name, point))

      // -- Tip Angle

      let exerciseData = poseData[route.params.exerciseOption];

      generateTips(points, exerciseData)

      // -- Mistake Angle
      // const mistakeAngle = getAngle(points.get(LANDMARKS.RIGHT_ELBOW), points.get(LANDMARKS.RIGHT_SHOULDER), points.get(LANDMARKS.RIGHT_HIP));
      // setShoulderAngle(Math.round(mistakeAngle))
      generateMistakes(points, exerciseData);

      setCurrentPoses(poses)
    }
  }

  // -- To determine state
  const generateTips = (points, exerciseData) => {
    // console.log("poseData: ", poseData)
    // console.log("exercise: ", poseData.tricep_presses_left)

    const threshold = exerciseData.threshold;
    const bodyParts = exerciseData.bodyParts;
    // console.log("bodyParts: ", bodyParts);
    var angle = getAngle(points.get(bodyParts[0]), points.get(bodyParts[1]), points.get(bodyParts[2]));
    setArmAngle(Math.round(angle))
    // console.log("tip angle: ", angle);

    const minResetAngle = exerciseData.resetMinAngle;
    const maxResetAngle = exerciseData.resetMaxAngle;

    const minEndAngle = exerciseData.endMinAngle;
    const maxEndAngle = exerciseData.endMaxAngle;

    let compare = exerciseData.compare;
    let tips = exerciseData.adviceTips;

    if (compare === "more") {
      if (angle > threshold) {
        // console.log("angle: ", angle);
        // -- Reset Posemain
        setMidState(false);
        setRestState(true);
        setDoneState(false);
        if (angle >= minResetAngle && angle <= maxResetAngle) {
          if (tips.length > 1) {
            setTips(tips[1]);
          } else {
            setTips("Rest Position reached.");
          }
          // console.log("Rest Position reached.")
        }
      }
      else {
        // -- Moving towards end pose
        if (angle >= minEndAngle && angle <= maxEndAngle) {
          setTips("Well done! Exercise done succesfully!");
          setMidState(false);
          setRestState(false);
          setDoneState(true);
        }
        else {
          setTips(tips[0]);
          setMidState(false);
          setRestState(true);
          setDoneState(false);
        }

      }

    } else {
      if (angle < threshold) {
        // console.log("angle: ", angle);
        // -- Reset Pose
        setMidState(false);
        setRestState(true);
        setDoneState(false);
        if (angle >= minResetAngle && angle <= maxResetAngle) {
          setTips("Rest Position reached.");
          // console.log("Rest Position reached.")
        }
      }
      else {
        // -- Moving towards end pose
        if (angle >= minEndAngle && angle <= maxEndAngle) {
          setTips("Well done! Exercise done succesfully!");
          setMidState(false);
          setRestState(false);
          setDoneState(true);
        }
        else {
          setTips(tips[0]);
          setMidState(false);
          setRestState(true);
          setDoneState(false);
        }

      }
    }

    // console.log("max: ", maxResetAngle);
    // console.log("threshold: ", threshold);

  }

  const generateMistakes = (points, exerciseData) => {
    const bodyParts = exerciseData.mistakeBodyParts;
    const angle = getAngle(points.get(bodyParts[0]), points.get(bodyParts[1]), points.get(bodyParts[2]));
    setShoulderAngle(Math.round(angle))

    // console.log("mistake angle: ", angle);
    let mistakeTips = exerciseData.mistakeTips;

    if (angle <= exerciseData.mistakeMinAngle) {
      setMistakes(mistakeTips[0]);
      //console.log("Push your elbows back further. This will keep your triceps working even at full extension.")
      setMidState(true);
      setRestState(false);
      setDoneState(false);
    }
    else if (angle >= exerciseData.mistakeMaxAngle) {
      if (mistakeTips.length > 1) {
        setMistakes(mistakeTips[1]);
        setMidState(true);
        setRestState(false);
        setDoneState(false);
      }
    }
    else {
      setMistakes("");
    }
  }

  const renderPose = () => {
    if (poses != null && poses.length > 0) {
      return drawSkeleton(poses[0].keypoints);
    } else {
      return <View></View>;
    }
  };

  const drawSkeleton = (keypoints) => {
    const lines = drawLines(keypoints)
    const circles = drawCircles(keypoints)

    return (
      <Svg style={styles.svg}>
        {circles}
        {lines}
      </Svg>
    )
  }

  const drawCircles = (keypoints) => {
    const circles = keypoints
      .filter((k) => (k.score ?? 0) > MIN_KEYPOINT_SCORE)
      .map((k) => {
        // Flip horizontally on android or when using back camera on iOS.
        const flipX = IS_ANDROID || cameraType === Camera.Constants.Type.back;
        const x = flipX ? getOutputTensorWidth() - k.x : k.x;
        const y = k.y;
        const cx =
          (x / getOutputTensorWidth()) *
          (isPortrait() ? CAM_PREVIEW_WIDTH : CAM_PREVIEW_HEIGHT);
        const cy =
          (y / getOutputTensorHeight()) *
          (isPortrait() ? CAM_PREVIEW_HEIGHT : CAM_PREVIEW_WIDTH);
        return (
          <Circle
            key={`skeletonkp_${k.name}`}
            cx={cx}
            cy={cy}
            r='4'
            strokeWidth='2'
            fill='#00AA00'
            stroke='white'
          />
        );
      });
    return circles;
  }

  const drawLines = (
    keypoints,
    showFacePoints = true
  ) => {
    let lines = []
    // key points by name
    const points = new Map()
    keypoints.map((point) => points.set(point.name, point))

    lines.push(drawLine("shoulder", points.get('left_shoulder'), points.get('right_shoulder')))
    lines.push(drawLine("hip", points.get('left_hip'), points.get('right_hip')))

    // left arm
    lines.push(drawLine("left_arm", points.get('left_shoulder'), points.get('left_elbow')))
    lines.push(drawLine("left_arm", points.get('left_elbow'), points.get('left_wrist')))

    // left side
    lines.push(drawLine("side", points.get('left_shoulder'), points.get('left_hip')))

    // left leg
    lines.push(drawLine("left_leg", points.get('left_hip'), points.get('left_knee')))
    lines.push(drawLine("left_leg", points.get('left_knee'), points.get('left_ankle')))

    // right arm
    lines.push(drawLine("right_arm", points.get('right_shoulder'), points.get('right_elbow')))
    lines.push(drawLine("right_arm", points.get('right_elbow'), points.get('right_wrist')))

    // right side
    lines.push(drawLine("side", points.get('right_shoulder'), points.get('right_hip')))

    // right leg
    lines.push(drawLine("right_leg", points.get('right_hip'), points.get('right_knee')))
    lines.push(drawLine("right_leg", points.get('right_knee'), points.get('right_ankle')))

    if (showFacePoints) {
      lines.push(drawLine("face", points.get('right_ear'), points.get('right_eye')))
      lines.push(drawLine("face", points.get('right_eye'), points.get('nose')))
      lines.push(drawLine("face", points.get('nose'), points.get('left_eye')))
      lines.push(drawLine("face", points.get('left_eye'), points.get('left_ear')))
    }
    return lines
  }

  function drawLine(type, pointA, pointB) {
    if (pointA.score < MIN_KEYPOINT_SCORE || pointB.score < MIN_KEYPOINT_SCORE)
      return


    const flipX = IS_ANDROID || cameraType === Camera.Constants.Type.back;
    const x1 = flipX ? getOutputTensorWidth() - pointA.x : pointA.x;
    const y1 = pointA.y

    const x2 = flipX ? getOutputTensorWidth() - pointB.x : pointB.x;
    const y2 = pointB.y
    const cx1 =
      (x1 / getOutputTensorWidth()) *
      (isPortrait() ? CAM_PREVIEW_WIDTH : CAM_PREVIEW_HEIGHT);
    const cy1 =
      (y1 / getOutputTensorHeight()) *
      (isPortrait() ? CAM_PREVIEW_HEIGHT : CAM_PREVIEW_WIDTH);

    const cx2 =
      (x2 / getOutputTensorWidth()) *
      (isPortrait() ? CAM_PREVIEW_WIDTH : CAM_PREVIEW_HEIGHT);
    const cy2 =
      (y2 / getOutputTensorHeight()) *
      (isPortrait() ? CAM_PREVIEW_HEIGHT : CAM_PREVIEW_WIDTH);


    let strokeColor = '#FAFAFA';
    let thickness = 4;

    // console.log("poseData[tricep_presses_left]: ", poseData.tricep_presses_left);

    let exerciseOption = poseData[route.params.exerciseOption];

    if (type === exerciseOption.type) {

      thickness = 8;

      if (restState) {
        strokeColor = '#171ADD';
      } else if (midState) {
        strokeColor = '#DD1717'
      } else {
        strokeColor = '#44BB36'
      }
    }

    return (
      <Line
        key={`skeletonkp_line_${pointA.name}_${pointB.name}`}
        x1={cx1}
        y1={cy1}
        x2={cx2}
        y2={cy2}
        stroke={strokeColor}
        strokeWidth={thickness}
      />
    )
  }

  const renderFps = () => {
    return (
      <View style={styles.fpsContainer}>
        <Text>FPS: {fps}</Text>
      </View>
    );
  };

  const renderDoneWorkoutButton = () => {
    const name = route.params.exerciseOption.split('_').join(' ')

    return (
      <View
        style={styles.doneButton}
        onTouchEnd={() => {
          setModal(true);
          Speech.stop();
          speakSuggestions();
        }}
      >
        <Text>
          Done {name}
        </Text>
      </View>
    );
  };

  const renderSuggestNextWorkout = () => {
    const currentWorkout = route.params.exerciseOption;
    const musclesArray = poseData[currentWorkout].muscles;
    const muscles = musclesArray.length === 1 ? musclesArray[0] : musclesArray.length === 2 ? musclesArray.join(" or ") : musclesArray.slice(0, -1).join(", ") + ' or ' + musclesArray.slice(-1);
    const nextArray = poseData[currentWorkout].next;
    const next = nextArray.length === 1 ? nextArray[0] : nextArray.length === 2 ? nextArray.join(" or ") : nextArray.slice(0, -1).join(", ") + ' or ' + nextArray.slice(-1);

    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={modal}
        onRequestClose={() => {
          setModal(!modal);
        }}
        style={styles.modalContainer}
      >
        <View style={styles.modalView}>
          <View>
            <Text style={{ textAlign: "center", marginBottom: 10 }}>Congrats on working {muscles} muscle(s)</Text>
            <Text style={{ textAlign: "center", marginBottom: 10 }}>Consider doing {next} workout(s) next </Text>

            <Pressable
              onPress={() => {
                setModal(!modal);
                navigation.navigate('Home');
              }}
              style={styles.modalButton}
            >
              <Text style={{ textAlign: "center", color: "white" }}>Choose Next Workout</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    )
  };

  // This does not work right now
  async function saveToMediaLibrary(fileUri) {
    try {
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      const album = await MediaLibrary.getAlbumAsync('FitCam');
      if (album == null) {
        await MediaLibrary.createAlbumAsync('FitCam', asset, false);
      } else {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      }
    } catch (e) {
      console.log('Error saving to media library:', e);
    }

  }

  const handleRecordButtonPressed = () => {
    if (!recording) {
      cameraRef.current.camera.recordAsync()
        .then((data) => {
          console.log("data", data)

          const fileName = `fitcam-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`
          uploadToFirebaseAsync(data.uri, fileName, (progress) => {
            console.log("progress", progress)
          });
        })
        .catch((err) => { console.error("Error during recording:", err) });
    }
    else {
      cameraRef.current.camera.stopRecording();
    }
    setRecording(!recording);
  }

  const renderRecordButton = () => {
    return (
      <View>
        <TouchableOpacity
          style={{ display: 'flex', justifyContent: 'center', justifyItems: 'center' }}
          onPress={handleRecordButtonPressed}
        >
          <MaterialCommunityIcons name="record-circle-outline" size={50} color={recording ? 'red' : 'black'} />
        </TouchableOpacity>
        {/* {recording ? <Text>Stop Recording</Text> : <Text>Start Recording</Text>} */}
      </View>
    );
  }

  const isPortrait = () => {
    return (
      orientation === ScreenOrientation.Orientation.PORTRAIT_UP ||
      orientation === ScreenOrientation.Orientation.PORTRAIT_DOWN
    );
  };

  const getOutputTensorWidth = () => {
    // On iOS landscape mode, switch width and height of the output tensor to
    // get better result. Without this, the image stored in the output tensor
    // would be stretched too much.
    //
    // Same for getOutputTensorHeight below.
    return isPortrait() || IS_ANDROID
      ? OUTPUT_TENSOR_WIDTH
      : OUTPUT_TENSOR_HEIGHT;
  };

  const getOutputTensorHeight = () => {
    return isPortrait() || IS_ANDROID
      ? OUTPUT_TENSOR_HEIGHT
      : OUTPUT_TENSOR_WIDTH;
  };

  const getTextureRotationAngleInDegrees = () => {
    // On Android, the camera texture will rotate behind the scene as the phone
    // changes orientation, so we don't need to rotate it in TensorCamera.
    if (IS_ANDROID) {
      return 0;
    }

    // For iOS, the camera texture won't rotate automatically. Calculate the
    // rotation angles here which will be passed to TensorCamera to rotate it
    // internally.
    switch (orientation) {
      // Not supported on iOS as of 11/2021, but add it here just in case.
      case ScreenOrientation.Orientation.PORTRAIT_DOWN:
        return 180;
      case ScreenOrientation.Orientation.LANDSCAPE_LEFT:
        return cameraType === Camera.Constants.Type.front ? 270 : 90;
      case ScreenOrientation.Orientation.LANDSCAPE_RIGHT:
        return cameraType === Camera.Constants.Type.front ? 90 : 270;
      default:
        return 0;
    }
  };

  if (!tfReady) {
    return (
      <View style={styles.loadingMsg}>
        <Text>Loading...</Text>
      </View>
    );
  } else {
    return (
      // Note that you don't need to specify `cameraTextureWidth` and
      // `cameraTextureHeight` prop in `TensorCamera` below.
      <View
        style={
          isPortrait() ? styles.containerPortrait : styles.containerLandscape
        }
      >
        <TensorCamera
          ref={cameraRef}
          style={styles.camera}
          autorender={AUTO_RENDER}
          type={cameraType}
          // tensor related props
          resizeWidth={getOutputTensorWidth()}
          resizeHeight={getOutputTensorHeight()}
          resizeDepth={3}
          rotation={getTextureRotationAngleInDegrees()}
          onReady={handleCameraStream}
        />
        {renderPose()}
        {renderFps()}
        {renderDoneWorkoutButton()}
        {renderSuggestNextWorkout()}
        <View >
          <View style={styles.repsContainer}>
            <Text style={styles.reps}> Reps: {reps}</Text>
            <TouchableOpacity onPress={handleResetReps}>
              <Text style={styles.resetButton}>Reset Reps</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.tipText}>{Tips}</Text>

          <Text style={styles.tipText}>{Mistakes}</Text>

          <View style={styles.recordButtonContainer} >
            {renderRecordButton()}
          </View>
        </View>
        {/* Container for Angle
        <View style={{ position: 'absolute', justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 20 }}> Angle: {armAngle}</Text>
        </View>
        <View style={{ position: 'absolute', justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 20 }}> Shoulder Angle: {shoulderAngle}</Text>
        </View> */}
      </View>

    );
  }
}

const styles = StyleSheet.create({
  containerPortrait: {
    position: 'relative',
    width: CAM_PREVIEW_WIDTH,
    height: CAM_PREVIEW_HEIGHT,
    marginTop: Dimensions.get('window').height / - CAM_PREVIEW_HEIGHT / 2,
  },
  containerLandscape: {
    position: 'relative',
    width: CAM_PREVIEW_HEIGHT,
    height: CAM_PREVIEW_WIDTH,
    marginLeft: Dimensions.get('window').height / 2 - CAM_PREVIEW_HEIGHT / 2,
  },
  loadingMsg: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: {
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  svg: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    zIndex: 30,
  },
  fpsContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 80,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, .4)',
    borderRadius: 2,
    padding: 8,
    zIndex: 20,
  },
  doneButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: '60%',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, .9)',
    borderRadius: 10,
    padding: 8,
    zIndex: 30,
  },
  resetButton: {
    fontSize: 18,
    color: '#FFF',
    backgroundColor: "#799ADD",
    borderRadius: 15,
    padding: 10,
    elevation: 2,
    width: '100%',
    alignSelf: 'center'
  },
  recordButtonContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    justifySelf: 'flex-end',
    bottom: -10
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    height: '500px'
  },
  modalView: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    margin: 20,
    marginTop: Dimensions.get('window').height / 1.5 - CAM_PREVIEW_HEIGHT / 2,
    backgroundColor: "white",
    borderRadius: 20,
    paddingLeft: 18,
    paddingRight: 18,
    padding: 35,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5
  },
  modalButton: {
    backgroundColor: "#000",
    borderRadius: 15,
    padding: 10,
    elevation: 2,
    width: '100%',
    alignSelf: 'center'
  },
  tipText: {
    paddingHorizontal: 10,
    marginBottom: 5,
    fontSize: 15,
  },
  repsContainer: {
    marginTop: 5,
    marginBottom: 10,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignContent: 'center',
    marginHorizontal: 10,
  },
  reps: {
    alignSelf: 'center',
    fontSize: 20,
  }
  
});


