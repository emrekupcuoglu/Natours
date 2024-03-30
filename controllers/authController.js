const { async } = require("regenerator-runtime");
const crypto = require("crypto");
const { promisify } = require("node:util");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const catchAsync = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const Email = require("../utils/email");

const signToken = (id) =>
  // ! Using the standard HSA256 encryption the secret should be at least 64 characters long, but longer the better.
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const createSendToken = (user, statusCode, req, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),

    // secure property makes it so the cookie will only be sent over an encrypted connection
    // This ensures that man in the middle attacks don't work
    // *We added this conditionally below because we are using http, that is why it is commented out
    // secure: true,
    // httpOnly property makes it so the cookie can not be accessed or modified in any way by the browser
    // This is important to prevent XSS attacks
    httpOnly: true,
  };

  // We need to enforce website wide HTTPS protocol. To do that we have written a function in the app.js folder that checks if the client uses HTTPS. If it uses HTTPS it continues normally if it does not then we redirect to a page that uses the HTTPS protocol. It looks like railway does this automatically but, we implemented this ourselves just in case. There is also a package called express-sslify that also handles deployment to azure as well as heroku, etc.

  // console.log(req.secure, req.header["x-forwarded-proto"]);
  // !We have set the the cookie to secure when we are in production but the problem with this
  // the fact that we are in production doesn't mean the connection is actually secure
  // Because not all deployed applications are automatically set to https
  // We need to change this if statement because of this
  // We have refactored the if statement and put it in the cookieOptions
  // if (process.env.NODE_ENV === "production") cookieOptions.secure = true;

  // In express.js we have a secure property that is on the request
  // Only when the connection is secure then the req.secure is equals to secure
  // ! Another problem is this doesn't work in hero (it might work with railway but it is not healthy to rely on providers for this)
  // Because heroku proxies which basically means redirects or modifies all incoming requests into out application, before they actually reach the app.

  // * Taken from express-sslify package npm website
  // Heroku, nodejitsu and other hosters often use reverse proxies which offer SSL endpoints but then forward unencrypted HTTP traffic to the website. This makes it difficult to detect if the original request was indeed via HTTPS. Luckily, most reverse proxies set the x-forwarded-proto header flag with the original request scheme. express-sslify is ready for such scenarios, but you have to specifically request the evaluation of this flag:

  // In order to make this also work in heroku we also need to test if the x-forward proto header is set to https.
  // ! x-forwarded-* headers are not secure thats why heroku overwrites them automatically
  if (req.secure === true || req.headers["x-forwarded-proto"] === "https") {
    cookieOptions.secure = true;
  }
  // console.log(cookieOptions.secure);
  // ! In order for this to work we also need to trust proxies because heroku and railway like services use reverse proxies
  // ! We do that in the app.js

  // ? Sending a cookie

  res.cookie("jwt", token, cookieOptions);

  // In the isLoggedIn handler we are checking if the user is logged in or not.
  // We are doing it by querying the database, to not query the database needlessly we send some of the user info as a cookie so that we can pass them to the res.locals for pug, to render without querying the database.
  // const userCookie = { name: user.name, photo: user.photo };
  // res.cookie("user", JSON.stringify(userCookie), cookieOptions);

  // Remove password from the output
  user.password = undefined;
  res.status(statusCode).json({
    status: "success",
    token,
    data: {
      user,
    },
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  // !This here is a major security flaw
  // Because we are creating the user using all the data that is coming in
  // with the body and like this anyone can specify the role as an admin
  // const newUser = await User.create(req.body);

  // To fix it we only get the data we need from the req.body
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
  });

  newUser.password = undefined;

  // ! NOT SENDING THE EMAIL IN PRODUCTION BECAUSE I DON'T HAVE A PAID DOMAIN
  // Sending email to the user
  if (process.env.NODE_ENV === "development") {
    const url = `${req.protocol}://${req.get("host")}/me`;
    await new Email(newUser, url).sendWelcome();
  }

  createSendToken(newUser, 201, req, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1. Check if email and password exist
  if (!email || !password) {
    return next(new AppError("Please provide email and password", 400));
  }

  // 2. Check if the users exist && password is correct

  // We hide the password from the schema so we need a way to select it
  // When we want to select a field that is set to select: false by default
  // we need to add the + sign in front of it
  const user = await User.findOne({ email }).select("+password");

  // ! We check both the password and the user at the same time because of security
  // We could of check them separately and tell the user if their email or password is wrong but this give a potential attacker information about whether the email or password is correct. But this is more vague, we are not specifying what is incorrect.

  if (!user || !(await user.correctPassword(password)))
    return next(new AppError("Incorrect email or password", 401));

  // 3. If everything is ok, send the JWT to the client
  createSendToken(user, 200, req, res);
});

exports.logout = (req, res, next) => {
  const cookieOptions = {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    // * We don't need to set this to secure because there is no sensitive data
    // but it is still a good idea to set it anyway
  };
  // res.cookie("jwt", "logged out");
  if (process.env.NODE_ENV === "production") cookieOptions.secure = true;

  //  To clear a cookie, the cookie options argument of the clearCookie needs to be same as the cookieOptions when we are setting the cookie.
  res.clearCookie("jwt", cookieOptions);
  res.status(200).json({
    status: "success",
  });
};

exports.protect = catchAsync(async (req, res, next) => {
  // *1. Getting the token and check if it exist

  const token = req.cookies.jwt;

  if (!token) {
    return next(
      new AppError("You are not logged in! Please log in to get access.", 401)
    );
  }

  // *2. Verification of the JWT

  const jwtVerifyPromise = promisify(jwt.verify);
  const decoded = await jwtVerifyPromise(token, process.env.JWT_SECRET);
  // console.log(decoded);

  // *3.Check if user still exist
  // This is the reason why we have the id in the payload
  // We need role field in the next middleware, instead  of querying for it again and taxing the database we will make it selectable here.
  const currentUser = await User.findById(decoded.id).select("+role");
  if (!currentUser) return next(new AppError("Please log in", 401));

  // *4. Check if user changed password after the JWT is issued
  // iat stands for issued at
  const isPasswordChanged = currentUser.changedPasswordAfter(decoded.iat);
  if (isPasswordChanged) {
    return next(new AppError("Please log in", 401));
  }

  // GRANT ACCESS TO THE PROTECTED ROUTE
  // ! Storing the currentUser in to the request is really crucial
  // ! Otherwise we wouldn't get access to the user in the next middleware restrictTo which we use for authorization.
  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

// This middleware is similar to protect but the goal is not to protect
// instead it is to check if the user is logged in or not.
exports.isLoggedIn = catchAsync(async (req, res, next) => {
  if (!req.cookies.jwt) return next();
  // 1. Verify token
  const jwtVerifyPromise = promisify(jwt.verify);
  const decoded = await jwtVerifyPromise(
    req.cookies.jwt,
    process.env.JWT_SECRET
  );

  // 2. Check if user still exist
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) return next();

  // 3. Check if the user has changed their password after the jwt was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) return next();

  // If the user exist and logged in we can make the user accessible in our templates
  // to do that we use res.locals and our pug templates will then have access to them

  // ! We have put the set res.locals in the protect as well
  // and only use the isLoggedIn handler on routes that the protect handler doesn't get called. But we are still querying the database on every page only to put the name and the photo of the user, which is not desirable in my opinion.

  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

exports.restrictTo =
  (...roles) =>
  (req, res, next) => {
    // we need to include role because we set select to false in the schema
    // We did this on the protect handler above
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("You do not have permission to perform this action!", 403)
      );
    }
    next();
  };

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1. Get users based on POSTed email
  const user = await User.findOne({ email: req.body.email });

  if (!user)
    return next(
      new AppError(
        "If there is an account associated with that email we have sent a reset link",
        200
      )
    );

  // 2. Generate random token
  const resetToken = user.createPasswordResetToken();

  // 3. Save it to the database
  // We have assigned a value to the passwordResetToken but not saved it to the database
  // We need to use the .save() method to save it to the database
  // ! We need to pass in the validateModifiedOnly for it to work because
  // ! .save() methods runs validators by default problem arises when it tries to validate the passwordConfirm but it can not find it in the user document, it can not find it because we have deleted the passwordConfirm so that it doesn't waster any space in the database. Because passwordConfirm is required it fails. This is why it only fails on passwordConfirm even though the password field is also required.
  // ? In a large codebase this bug might be hard to find to solve this we can be more explicit and use a virtual field for the passwordConfirm. ()
  await user.save({ validateModifiedOnly: true });

  // 4. Send it as email

  // API
  let resetURL = `${req.protocol}://${req.get(
    "host"
  )}/api/v1/users/resetPassword/${resetToken}`;

  // Rendered Website

  if (req.body.isRendered) {
    resetURL = `${req.protocol}://${req.get(
      "host"
    )}/resetPassword/${resetToken}`;
  }

  try {
    await new Email(user, resetURL).sendPasswordReset();

    // await sendEmail({
    //   email: user.email,
    //   subject: "Your password reset token (valid for 10 mins)",
    //   message,
    // });

    res.status(200).json({
      status: "success",
      message: "Token sent to email!",
    });
  } catch (err) {
    // delete the passwordResetToken and passwordResetExpires field from the user document in case there is an error
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateModifiedOnly: true });

    // ! This is a security vulnerability because we are sending if we have sent an email or not.
    // ! look for password reset strategies on OWASP for more robust implementation
    return next(new Error(err));
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1. Get user based on the token
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");
  // 2. If token not expired and user exist set the new password
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    // With Date.now() we get a timestamp but we store the date as a date time string
    // behind the scenes mongoDB will do some converting to be able to compare them so we don't have to
    // passwordResetExpires: { $gt: Date.now() },
  });
  // console.log(user);

  if (!user) return next(new AppError("Token is invalid or expired", 400));
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  // We do not want to pass in validateModifiedOnly because we want to validate
  // if password and the passwordConfirm exist and they are the same.
  await user.save();
  // 3. Update passwordChangedAt property
  // 4. Log the user in
  createSendToken(user, 200, req, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1. Get user from collection
  if (!req.user) return next(new AppError("Please login", 401));
  const user = await User.findById(req.user.id).select("+password");
  // 2. Check if POSTed password is correct
  const currentPassword = req.body.passwordCurrent;
  if (!(await user.correctPassword(currentPassword)))
    return next(new AppError("Wrong password. Try again.", 401));
  // 3. If so update the password
  user.password = req.body.passwordNew;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();

  // 4. Log the user in, send JWT
  createSendToken(user, 200, req, res);
});
