import { 
  StyleSheet, 
  Text, 
  View, 
  Pressable, 
  Image, 
  Alert,
  ActivityIndicator
} from "react-native";
import React, { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { jwtDecode } from "jwt-decode";
import axios from "axios";
import { useRouter } from "expo-router";
import { useAuth } from '../../_context/AuthContext';

const Select = () => {
  const router = useRouter();
  const [option, setOption] = useState("");
  const [userId, setUserId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { updateUser } = useAuth();

  // Gender options with corresponding icons
  const genderOptions = [
    {
      id: "male",
      label: "I am a Man",
      icon: "https://cdn-icons-png.flaticon.com/128/12442/12442425.png"
    },
    {
      id: "female",
      label: "I am a Woman",
      icon: "https://cdn-icons-png.flaticon.com/128/9844/9844179.png"
    },
    {
      id: "nonbinary",
      label: "I am Non-Binary",
      icon: "https://cdn-icons-png.flaticon.com/128/12442/12442425.png"
    },
    {
      id: "prefer-not-to-say",
      label: "Prefer not to say",
      icon: "https://cdn-icons-png.flaticon.com/128/1828/1828884.png"
    }
  ];

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = await AsyncStorage.getItem("authToken");
        if (token) {
          const decodedToken = jwtDecode(token);
          setUserId(decodedToken.userId);
        }
      } catch (error) {
        console.log("Error decoding token:", error);
      }
    };

    fetchUser();
  }, []);

  const updateUserGender = async () => {
    if (!option) {
      Alert.alert("Error", "Please select a gender option");
      return;
    }

    setIsLoading(true);
    
    try {
      // Update gender on backend
      const response = await axios.put(
        `${API_BASE_URL}/api/users/${userId}/gender`,
        { gender: option },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await AsyncStorage.getItem('authToken')}`
          }
        }
      );

      // Update user in context and local storage
      if (updateUser) {
        await updateUser({ gender: option });
      }

      // Navigate directly to bio screen
      router.replace("/(tabs)/bio");
      
    } catch (error) {
      console.log("Error updating gender:", error);
      Alert.alert(
        "Error", 
        error.response?.data?.message || "Failed to update gender. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Your Gender</Text>
      <Text style={styles.subtitle}>This helps us match you with compatible partners</Text>

      {genderOptions.map((gender) => (
        <Pressable
          key={gender.id}
          onPress={() => setOption(gender.id)}
          style={[
            styles.optionContainer,
            option === gender.id && styles.selectedOption
          ]}
        >
          <Text style={styles.optionText}>{gender.label}</Text>
          <Image
            style={styles.optionIcon}
            source={{ uri: gender.icon }}
          />
        </Pressable>
      ))}

      {option && (
        <Pressable
          onPress={updateUserGender}
          style={styles.doneButton}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.doneButtonText}>Continue to Profile</Text>
          )}
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "gray",
    marginBottom: 30,
    textAlign: "center",
  },
  optionContainer: {
    backgroundColor: "#F8F8F8",
    padding: 15,
    borderRadius: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#F8F8F8",
  },
  selectedOption: {
    borderColor: "#FF5864",
    backgroundColor: "#FFF0F1",
  },
  optionText: {
    fontSize: 16,
    fontWeight: "500",
  },
  optionIcon: {
    width: 40,
    height: 40,
  },
  doneButton: {
    marginTop: 30,
    backgroundColor: "#FF5864",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  doneButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
});

export default Select;