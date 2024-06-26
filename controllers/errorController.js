const AppError = require("../utils/appError");

const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

const handleDuplicateErrorDB = (err) => {
  const entry = Object.entries(err.keyValue)[0];
  const key = entry[0];
  const value = entry[1];

  const message = `Duplicate field:${key} value: ${value}. Please use another value.`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const keys = Object.keys(err.errors);
  const errors = keys.map((key) => err.errors[key].message);
  const message = `Invalid input data. ${errors.join(". ")}`;
  return new AppError(message, 400);
};

const handleJWTError = () => {
  const message = "You are not logged in. Please log in.";
  return new AppError(message, 401);
};

const handleJWTExpiredError = () => {
  const message = "You login has expired. Login again";
  return new AppError(message, 401);
};

const handleEmailError = () => {
  const message =
    "Email failed to send (This website is a demo, your account is created)";
  return new AppError(message, 500);
};

const sendErrorDev = (err, req, res) => {
  // * A) API
  // originalUrl is basically the entire URL but without the host
  // It looks like the route
  if (req.originalUrl.startsWith("/api")) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  }
  // * B) RENDERED WEBSITE
  console.error("ERROR Rendered 💥:", err);

  return res.status(err.statusCode).render("error", {
    title: "Something went wrong",
    message: err.message,
  });
};

const sendErrorProd = (err, req, res) => {
  // * A) API
  // * A.1 Operational, trusted error: send message to the client.

  if (req.originalUrl.startsWith("/api")) {
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });
    }

    // * A.2 Programming or other unknown error: do not leak error details.
    // 1. Log error for developers
    // There are real logging libraries on npm that we could use here instead of just having this simple console.error
    // but just logging the error to the console will make it visible on the hosting platforms that we are going to use.
    // In a simple app like this it is enough.
    console.error("ERROR 💥:", err);

    // 2. Send generic error message to the client
    return res.status(err.statusCode).json({
      status: "error",
      message: "Something went very wrong!",
    });
  }

  // * B) RENDERED WEBSITE
  // * B.1 Operational, trusted error: send message to the client.

  if (err.isOperational) {
    return res.status(err.statusCode).render("error", {
      title: "Something went wrong!",
      message: err.message,
    });
  }
  // *B.2) Programming or other unknown error: do not leak error details.

  console.error("ERROR 💥:", err);

  // 2. Send generic error message to the client
  res.status(err.statusCode).render("error", {
    title: "Something went wrong",
    message: "Please try again later.",
  });
};
module.exports = (err, req, res, next) => {
  // This shows us the stack trace
  // console.log(err.stack);

  // We need to read which code to send from the error object
  // We need to define a default because there will be errors that are not coming from us
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (process.env.NODE_ENV === "development") {
    sendErrorDev(err, req, res);
  }
  if (process.env.NODE_ENV === "production") {
    let error = { ...err };
    // ! AppError inherits the message property from the Error class and {...err} doesn't copy the prototype chain
    // ! Because of this, this causes a problem.
    // ! We re-build the prototype chain to fix this
    Object.setPrototypeOf(error, err);
    // let error = Object.assign(err);
    // console.log(error);

    // Marking errors coming from mongoose as operational
    // Types of the errors mongoose is throwing is written in the value property of the error
    // Cast Error happens when mongoose tries to cast types and fails
    if (err.name === "CastError") {
      error = handleCastErrorDB(err);
    }

    // duplicate error doesn't have a name because it doesn't come from
    // mongoose but it comes from mongoDB and mongo has codes for errors.
    if (err.code === 11000) {
      error = handleDuplicateErrorDB(err);
    }

    // Handling Validation Errors
    if (err.name === "ValidationError") {
      error = handleValidationErrorDB(err);
    }

    if (err.name === "JsonWebTokenError") {
      error = handleJWTError();
    }

    if (err.name === "TokenExpiredError") {
      error = handleJWTExpiredError();
    }

    if (err.code === "EAUTH") {
      error = handleEmailError();
    }

    sendErrorProd(error, req, res);
  }
};
