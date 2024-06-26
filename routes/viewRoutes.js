const express = require("express");
const viewController = require("../controllers/viewsController");
const authController = require("../controllers/authController");

const router = express.Router();

router.get("/", authController.isLoggedIn, viewController.getOverview);
router.get("/tour/:slug", authController.isLoggedIn, viewController.getTour);
router.get("/signup", authController.isLoggedIn, viewController.getSignUpForm);
router.get("/login", authController.isLoggedIn, viewController.getLoginForm);
router.get("/me", authController.protect, viewController.getAccount);
router.get("/forgotPassword", viewController.getForgotPasswordForm);
router.get("/resetPassword/:token", viewController.getPasswordResetForm);

module.exports = router;
