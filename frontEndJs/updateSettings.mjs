/* eslint-disable no-undef */
/* eslint-disable import/prefer-default-export */
import { async } from "regenerator-runtime";
import axios from "axios";
import { showAlert } from "./alerts.mjs";

/**
 * @param string name
 * @param string email
 */
export const updateUserData = async (name, email) => {
  const excludedNames = ["", " "];
  const isValidName = !excludedNames.includes(name);
  if (!isValidName) {
    return showAlert("error", "Invalid name");
  }
  try {
    const res = await axios.patch("/submit-user-data", {
      name,
      email,
    });
    if (res.statusText === "OK") {
      showAlert("success", "User data successfully changed");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  } catch (err) {
    showAlert("error", err.response.data.message);
  }
};

/**
 * @param {Object} data - Data object to be sent.
 * @param {string} url - URL for the patch request.
 * @param {string} type - Type of the data that has been update. Used for rendering the alert banner.
 */

const update = async (data, url, type) => {
  try {
    const res = await axios.patch(url, data);
    showAlert("success", `${type} updated successfully`);
    return res;
  } catch (err) {
    showAlert("error", err.response.data.message);
  }
};
/**
 * @param {Object} data - Data object to be sent.
 */
export const updatePassword = async (data) => {
  const url = "/api/v1/users/updatePassword";
  await update(data, url, "password");
};
/**
 * @param {Object} data - Data object to be sent.
 */
export const resetPassword = async (data) => {
  const resetPasswordToken = window.location.pathname.split("/")[2];
  const url = `/api/v1/users/resetPassword${resetPasswordToken}`;
  await update(data, url, "password");
  window.location.assign("/");
};
/**
 * @param {Object} data - Data object to be sent.
 * @param {string|string} [type="data"] - Default value is "data", if updating photo type is "photo".
 */
export const updateSettings = async (data, type = "data") => {
  const url = "/api/v1/users/updateMe";
  if (type === "photo") {
    const res = await update(data, url, "photo");
    console.log(res);
    return res.data.data.user.photo;
  }
  await update(data, url, type);
};
