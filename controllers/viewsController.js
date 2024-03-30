const { async } = require("regenerator-runtime");
const Tour = require("../models/tourModel");
const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");

exports.getOverview = catchAsync(async (req, res, next) => {
  const tours = await Tour.find();
  res.status(200).render("overview", {
    title: "All Tours",
    tours,
  });
});

exports.getTour = catchAsync(async (req, res, next) => {
  const tour = await Tour.findOne({ slug: req.params.slug }).populate({
    path: "reviews",
    fields: "review rating user ",
  });

  if (!tour) return next(new AppError("No tour found", 404));

  res.status(200).render("tour", {
    title: `${tour.name} tour`,
    tour,
  });
});

exports.getSignUpForm = (req, res, next) => {
  if (req.user) return res.redirect("/me");
  return res.status(200).render("signup", {
    title: "Sign Up",
  });
};

exports.getLoginForm = (req, res, next) => {
  if (req.user) return res.redirect("/me");
  return res.status(200).render("login", {
    title: "Log in to your account",
  });
};

exports.getAccount = (req, res, next) => {
  res.status(200).render("account", {
    title: "Your account",
  });
};

exports.updateUserData = catchAsync(async (req, res, next) => {
  const excludedNames = ["", " "];
  const isValidName = !excludedNames.includes(req.body.name);
  if (req.body.name.length === 0 || !isValidName) {
    return next(new AppError("Name cannot be empty", 400));
  }
  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    {
      name: req.body.name,
      email: req.body.email,
    },
    {
      new: true,
      runValidators: true,
    }
  );
  res.status(200).render("account", {
    title: "Your account",
    user: updatedUser,
  });
});

exports.getForgotPasswordForm = catchAsync(async (req, res, next) => {
  res.status(200).render("forgotPassword");
});

exports.getPasswordResetForm = catchAsync(async (req, res, next) => {
  res.status(200).render("passwordReset");
});
