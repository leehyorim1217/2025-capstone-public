// src/api/verification.js
import axios from 'axios';
import { API_URL } from '../config';
import { getToken } from '../utils/storage';

const authHeader = async () => {
  const token = await getToken();
  return { Authorization: `Bearer ${token}` };
};

// ========== 대여 API ==========

export const startRental = async ({ checklistId, startLocation, equipmentInfo, imageUri }) => {
  try {
    const formData = new FormData();
    formData.append('checklistId', checklistId);
    formData.append('startLocation', JSON.stringify(startLocation));
    formData.append('equipmentInfo', JSON.stringify(equipmentInfo));

    if (imageUri) {
      const ext = imageUri.split('.').pop().split('?')[0] || 'jpg';
      formData.append('image', {
        uri: imageUri,
        name: `rental_start_${Date.now()}.${ext}`,
        type: `image/${ext}`,
      });
    }

    const response = await axios.post(
      `${API_URL}/verification/rental/start`,
      formData,
      { headers: await authHeader() }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const endRental = async ({ verificationId, endLocation, notes, imageUri }) => {
  try {
    const formData = new FormData();
    if (endLocation) formData.append('endLocation', JSON.stringify(endLocation));
    if (notes) formData.append('notes', notes);

    if (imageUri) {
      const ext = imageUri.split('.').pop().split('?')[0] || 'jpg';
      formData.append('image', {
        uri: imageUri,
        name: `rental_end_${Date.now()}.${ext}`,
        type: `image/${ext}`,
      });
    }

    const response = await axios.post(
      `${API_URL}/verification/rental/end/${verificationId}`,
      formData,
      { headers: await authHeader() }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getCurrentRental = async () => {
  try {
    const response = await axios.get(
      `${API_URL}/verification/rental/current`,
      { headers: await authHeader() }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const getRentalHistory = async ({ page = 1, limit = 10 } = {}) => {
  try {
    const response = await axios.get(
      `${API_URL}/verification/rental/history`,
      { params: { page, limit }, headers: await authHeader() }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const updateLocation = async (location) => {
  try {
    const response = await axios.patch(
      `${API_URL}/verification/rental/location`,
      { location },
      { headers: await authHeader() }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

// ========== 장비 인식 API ==========

export const detectAndMatchEquipment = async (imageUri) => {
  try {
    const ext = imageUri.split('.').pop().split('?')[0] || 'jpg';
    const formData = new FormData();
    formData.append('image', {
      uri: imageUri,
      name: `detect_${Date.now()}.${ext}`,
      type: `image/${ext}`,
    });

    const response = await axios.post(
      `${API_URL}/verification/equipment/detect-and-match`,
      formData,
      { headers: await authHeader() }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};

export const searchEquipment = async (query, category) => {
  try {
    const response = await axios.get(
      `${API_URL}/verification/equipment/search`,
      { params: { q: query, category }, headers: await authHeader() }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || error;
  }
};
