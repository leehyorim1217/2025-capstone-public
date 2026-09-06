// checklist-app-frontend/app.config.js
// 간단한 Expo 설정 (문제 해결용)

export default {
  expo: {
    name: "Equipment Rental System",
    slug: "equipment-rental-checklist",
    version: "1.0.0",
    orientation: "portrait",
    // icon: "./assets/icon.png",  // 임시로 비활성화
    userInterfaceStyle: "light",
    splash: {
      // image: "./assets/splash.png",  // 임시로 비활성화
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.equipmentrental.checklist"
    },
    android: {
      adaptiveIcon: {
        // foregroundImage: "./assets/adaptive-icon.png",  // 임시로 비활성화
        backgroundColor: "#ffffff"
      },
      package: "com.equipmentrental.checklist"
    },
    web: {
      // favicon: "./assets/favicon.png",  // 임시로 비활성화
      bundler: "metro",
      output: "static"
    },
    // Docker 환경 변수
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL || "http://192.168.0.14:5000/api",
      aiServerUrl: process.env.EXPO_PUBLIC_AI_SERVER_URL || "http://192.168.0.14:5001",
      environment: process.env.EXPO_PUBLIC_ENVIRONMENT || "development"
    },
    // 플러그인 설정 - expo-router 추가
    plugins: [
      "expo-router",
      "expo-web-browser"
    ]
  }
};