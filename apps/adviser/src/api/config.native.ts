import Constants from "expo-constants";
import { Platform } from "react-native";
const host = Constants.expoConfig?.hostUri?.split(":")[0];
export const DEFAULT_API_ENDPOINT = (process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "web" ? "http://localhost:8080" : host ? `http://${host}:8080` : "http://10.0.2.2:8080")).trim();
