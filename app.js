const path = require("node:path");
const express = require("express");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");
const cookieParser = require("cookie-parser");
const compression = require("express-compression");
const cors = require("cors");

const AppError = require("./utils/appError");
const globalErrorHandler = require("./controllers/errorController");
const tourRouter = require("./routes/tourRoutes");
const userRouter = require("./routes/userRoutes");
const reviewRouter = require("./routes/reviewRoutes");
const viewRouter = require("./routes/viewRoutes");

// Express module return a function and we run that function
// and save its results to a variable called app
const app = express();

// ? Trusting proxies so that heroku/railway can enforce https
// When we trust proxies express.js also uses the x-forwarded-proto for the value of req.protocol
app.enable("trust proxy");

// ? Enforcing HTTPS across the site
if (process.env.NODE_ENV === "production") {
  app.use((req, res, next) => {
    if (req.protocol !== "https")
      res.redirect(`https://${req.header("host")}${req.url}`);
    else next();
  });
}

// We have installed the pug module but we don't have to require pug because express handles that behind the scenes
app.set("view engine", "pug");
// We need to define where these views are located in our filesystem
// Pug templates are called views in Express.js because these templates are
// in fact the views in a model view controller architecture.
// path is a core node.js module that is used for manipulating path names
// It might seem a bit overkill to use the path.join() but we don't always know
// whether a path we have received from somewhere already has a slash or not.
// You will see this function all the time to prevent this kind of bug.
// Because with path.join() we don't even need to think about slashes
app.set("views", path.join(__dirname, "views"));

// 1. MIDDLEWARES
// middleware
// A middleware is basically a function that can modify request data
// It is called middleware because it stands in the middle of the request and response.
// It is just a step that the request goes through while it is being processed.
// The step the request goes through in this example is really simple
// The data from the body is added to the request object.
// We need to use app.use to use middleware

// ? Implement CORS
// ! CORS only work in the browser
// ! Other HTTP clients like POSTMAN etc. do not respect CORS
// cors only works for simple request without some modification
// simple request are GET, POST and HEAD requests (check mdn for more information)
// simple request are part of the obsolete CORS spec
// from mdn:
// the motivation is that the <form> element from HTML 4.0 (which predates cross-site XMLHttpRequest and fetch) can submit simple requests to any origin, so anyone writing a server must already be protecting against cross-site request forgery (CSRF). Under this assumption, the server doesn't have to opt-in (by responding to a preflight request) to receive any request that looks like a form submission, since the threat of CSRF is no worse than that of form submission. However, the server still must opt-in using Access-Control-Allow-Origin to share the response with the script.
// Apart from the headers automatically set by the user agent (for example, Connection, User-Agent, or the other headers defined in the Fetch spec as a forbidden header name), the only headers which are allowed to be manually set are those which the Fetch spec defines as a CORS-safelisted request-header, which are:
// Accept
// Accept-Language
// Content-Language
// Content-Type (please note the additional requirements below)
// Range (only with a simple range header value; e.g., bytes=256- or bytes=127-255)

// We also have non-simple requests called preflighted requests these are PUT, PATCH and DELETE (maybe a few more)
// and also request that sends cookies or use non-standard headers.
// These request require a so-called preflight phase.
// So whenever there is a non-simple request the browser will then automatically issue
// the preflight phase this is how it works:
// Before the real request actually happens, let's say a delete requests, browse
// first dose an options requests in order to figure out if the actual request is safe to send
// And this means for us developers is that on our server we need to actually responds to that options request
// Options is another HTTP request just like GET, POST or DELETE
// When we get one of these options request on our server we the need to send back
// the same Access-Control-Allow-Origin header. This way the browser will know that the actual request
// and in this case the DELETE request is safe to perform, and then executes the DELETE request.
// from mdn:
// Unlike simple requests, for "preflighted" requests the browser first sends an HTTP request using the OPTIONS method to the resource on the other origin, in order to determine if the actual request is safe to send. Such cross-origin requests are preflighted since they may have implications for user data.

// This is not for setting options. options is a HTTP request just like GET or POST
// We need to respond to this request because the browser sends an options request when there is a preflight phase.
// We define the route which we want to handle the options.
// We can only allow these complex request only on specific routes if we wanted
// app.options("/api/v1/tours/:id", cors());
// But for this project we will do this on all routes.
// We have a good control of allowing request combined with simple request and non-simple requests
// We can set the both on specific routes if we want
// handler is once again the cors middleware
app.options("*", cors());

// This setts the Access-Control-Allow-Origin to *
// This allows everyone to consume our API
app.use(cors());

// If we don't want to share our API but we want to be able to
// have the APIı on one domain or even  one subdomain (subdomain example:api.natours.com)
// and then have our front end application on a different domain
// e.g. If we have our API at api.natours.com but have our front-end app on natours.com
// In this case all we want to do is to allow access from this origin.
// In this case we would pass in an options object
// app.use(cors({ origin: "https://www.natours.com" }));

// ? Serving static files
// We use this middleware for serving static files
// like images, html, etc.
// When it can not find a route specified in any of our routes
// it will look into the public folder
// And with this we don't have to specify the public folder in the url as well
// We can just write http://127.0.0.1:3000/overview.html
// instead of http://127.0.0.1:3000/public/overview.html
app.use(express.static(path.join(__dirname, "public")));

// ? Set Security HTTP Headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "script-src": ["'self'", "https://unpkg.com"],
        "connect-src": ["'self'", "https://api.maptiler.com", "ws:"],
        "worker-src": ["'self'", "blob:"],
      },
    },
  })
);

// ? Body parser, reading data from body into req.body
// We can use the limit option to limit the amount of data that comes in the body
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());
// This middleware is for forms to work
// extended allows us to pass in more complex data
// We can also limit the amount of data that comes in as in the body parser
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ? Data Sanitization Against NoSQL Query Injection Attacks
// This middleware looks at req.body, req.query, req.params and removes any dollar sign ($) and dot (.)
//Because that is how mongoDB operators are written with $ and .
app.use(mongoSanitize());

// ? Data Sanitization Against XSS Attacks
// This middleware will clean any malicious HTML
// For example <script> will be converted into &lt;script>
app.use(xss());

// ? Preventing Data Pollution
// This prevents duplicate parameters in the query string
// We can also whitelist some parameters we want
// So that we can have duplicate parameters when we need
app.use(
  hpp({
    whitelist: [
      "duration",
      "ratingsQuantity",
      "ratingsAverage",
      "maxGroupSize",
      "difficulty",
      "price",
    ],
  })
);

// ? Preparing Out App For Deployment
// We compress the responses to prepare out app for production
// We also need to clean most of our console.logs when deployed
// because the logs will end up in our hosting platforms logs,
// and we don't want to pollute these logs in production.

// ? Compressing responses
// This middleware compresses all the of our responses
// whenever we send a text response to the client
// response will get dramatically compressed them no matter if it is JSON or HTML code
// This process doesn't affect images or other files.
app.use(compression({ brotli: { enabled: true, zlib: {} } }));

// *3rd party middleware
// We are using the environment variable to only use this logging middleware
// when we are in the development environment
if (process.env.NODE_ENV === "development") app.use(morgan("dev"));

// ? Rate Limiting
// Rate limit is a function that receives options
// We can define how many request per IP we are going to allow
// in a certain amount of time.
// * rateLimit returns a function that we can use as middleware
const limiter = rateLimit({
  // Max number of request allowed per IP
  max: 100,
  // Time window the request can be made
  // We set the time window to 1 hour
  windowMs: 60 * 60 * 1000,
  // If the limit is crossed by a certain IP they get an error message
  message: "Too many requests from this IP, please try again in an hour!",
});

app.use("/api", limiter);

// *Creating our own middleware
// We need to the app.use to use the middleware
// We will pass in the function we want as middleware to the app.use as an argument
// In each middleware function we have access to the request and the response
// as well as the next function
app.use((req, res, next) => {
  // console.log("Hello from the middleware");
  // We need to call the next() function
  // If we didn't call it the request - response cycle would get stuck
  // And we would not be able to move on to the next steps
  // And we would not be able to send a response to the client.
  next();
  // !The middleware we have created applies to every request because we didn't specify any route
  // !It will work on every request if it comes before route handlers
  // !If it comes after a route handler it will not work for that route
});

app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  // req.headers stores the request headers.
  // console.log(req.headers);
  next();
});

// Routing in Express
// Routing is basically means to determine
// how and application responds to a certain client request
// The route is basically the url
// and the http method, which is get in this case
// app.get("/",
// This is similar to the native way
// but in express the req and the res objects have a lot more data and methods

// (req, res) => {
// We need to add the status before we send the response to the client
// res.status(200).send("Hello from the server-side");

// send method sends a string but instead of sending a string
// we can send JSON using the json method
// And by using the json() it will automatically set our Content-type to application/json
//   res.status(200).json({
//     message: "Hello from the server-side",
//     app: "Natours"
//   });

// });

// app.post("/",
//   (req, res) => {
//     res.send("You can post to this URL");
//   });

// app.get("/api/v1/tours", (req, res) => {

// });

// const port = 3000;
// app.listen(port, () => {
//   console.log(`App running on port ${port}...`);
// });

// We use the postman to test this API

// ?What is an API?
// API stands for: Application Programming Interface
// It is a piece of software that can be used by another piece of software
//in order to allow applications to talk to each other.

// We have talked about web API before and they are the most commonly used APIs
// But there are more than web APIs.
// Application in API can be other things:
// Node.js' fs or http APIs("node APIs")
// Browser's DOM JavaScript API
// With object-oriented programming when exposing methods to the public
// we are creating an API
// And many more API for different purposes.

// *REST Architecture
// REST stands for: Representational State Transfer
// It is a way of building web APIs in a logical way making them easy to consume.
// We build an API for ourselves or for others to consume.
// We want to process of using the API as smooth as possible for the user.
// To build RESTful APIs we need to follow a couple of principles

// *1. Separate API into logical resources
// *2. Expose structured resource-based URLs
// *3. To perform different actions on data like reading writing or deleting data
// the API should use the http method NOT the URL
// *4. Send data as JSON (usually)
// *5. Be stateless

// *1. Resources
// The key abstraction of information in REST is a resource.
// Therefore all the data we want to share in the API should be divided into logical resources.
// Resource: Object or representation of something, which has data associated to it.
// Any information that can be named can be a resource (name NOT a verb)
// In the context of the Natours API it can be:
// tours, users, reviews

// *2 Exposing
// Exposing the data using structured url that the client can send request to.
// for example: https://www.natours.com/addNewTour
// for example: https://www.natours.com/getTour
// The entire address is called an URL
// the /addNewTour is called an API endpoint
// Our API will have many different endpoints
// each of which wll send different data back to the client
// or perform different actions.
// !Endpoints should contain only resources(nouns), and use HTTP methods for actions
// So add addNewTour and getTour are bad choices for API endpoints
// Instead use GET /tours
// Instead use POST /tours
// We used the same API endpoint and change the method(verb)
// We can use the GET method to get all the tours
// or we can use and id or a name to get a specific tour like:
// GET /tours/7
// We can use the POST method to create a new tour

// To update the resources either a PUT or a PATCH request should be made tp the endpoint
// Difference between them is with PUT the client supposed to send the entire updated object
// while with PATCH it is only supposed to send the part of the object that has been changed.
// POST is for creating a new  resource while PUT and PATCH are for updating an existing resource

// Top delete a resource there is the DELETE http method

// *These operation are called CRUD: Create, Read, Update, Delete

// https://www.natours.com/getToursByUser
// https://www.natours.com/deleteToursByUser
// These end points can be transformed into
// "Get tours from user number 3"
// GET    https://www.natours.com/users/3/tours
// "Delete tour 9 from user number 3"
// DELETE https://www.natours.com/users/3/tours/9

// *What is JSON
// JSON is a very lightweight data interchange format,
// which is heavily used by web APIs coded in any programming language.
// It is not just related to JavaScript
// It is widely used because it is easy for both humans and computers to write JSON
// JSON looks like a JavaScript object with all the key/value pairs
// But there are some differences
// The most important one is that all the keys have to be strings
// It is also typical for values to be strings as well, but they be other things
// like numbers, true/false values, other objects, or even arrays of other values.

// Let's say that this is a data that we have in our database for a GET request to
// https://www.natours.com/tours/5
// const JSON0 = {
//   "id": 5,
//   "tourName": "The Park Camper",
//   "rating": "4.9",
//   "guides": [
//     {
//       "name": "Steven Miller",
//       "role": "Lead Guide",
//     },
//     {
//       "name": "Lisa Brown",
//       "role": "Tour Guide",
//     }
//   ],
// };
// We could send it back like this to the client
// but we usually do some simple response formatting
// There are a couple of standards for this
// we will use a very basic one called JSend
// We simply create a new object and add a status message to it
// in order to inform the client whether the was a success, failed, or error
// then we put our original data into a new object called data
// There are other standards for response formatting like:
// JSON:API or ODATA JSON Protocol

// const JSEND =
// {
//   "status": "data",

//   "data": {
//     "id": 5,
//     "tourName": "The Park Camper",
//     "rating": "4.9",
//     "guides": [
//       {
//         "name": "Steven Miller",
//         "role": "Lead Guide",
//       },
//       {
//         "name": "Lisa Brown",
//         "role": "Tour Guide",
//       }
//     ],
//   }
// };

// *5 Be Stateless
// ALl state is handled on the client
// This means that each request must contain all the information
// necessary to process a certain request.
// The server should not have to remember previous requests

// Examples of state: loggedIN    currentPage

// We call the JSON.parse to turn the JSON into a JavaScript object
// We do this because json() method of express.js automatically turns JAvaScript object into JSON
// By calling the JSON.stringify() method

// !To use tourRouter we have to add it to our middleware stack
// Because tourRouter is a real middleware
// First we specify the route which we want to use this router(middleware)
// Then the function, which is the router in this case, we want to be executed
// We have basically created a sub application
// This process is called mounting the router
// We are mounting the router on a new route
app.use("/", viewRouter);
app.use("/api/v1/tours", tourRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/reviews", reviewRouter);

// ? Handling Unhandled Routes
// If a route reaches here past the tourRouter and the userRouter
// So past all of the routers we use than that route is unhandled
// and we can add a middleware at the end to handle them
// We can use app.{http method} but we would need one for each method
// like this: app.get().post()...
// But we don't want that we want to handle all the routes
// and methods in one handler.
// We can use app.all to handle all http methods
// and we want pass in a star to handle all of the routes

// This works because of the request response cycle
// If any matching route is found than the request response cycle is finished
// and the request doesn't hit this middleware so it doesn't get executed.
// *res.end method ends the request response cycle
// In express it is automatically called with the .json() method
// It calls the .json() and sets the Content-Type to application/json
app.all("*", (req, res, next) => {
  // res.status(404).json({
  //   status: "fail",
  //   message: `Can't find ${req.originalUrl} on this server!`,
  // });

  // ? Creating an Error
  // const err = new Error(`Can't find ${req.originalUrl} on this server!`);
  // err.status = "fail";
  // err.statusCode = 404;

  // We can't just use throw err we need to use the next() function
  // We pass in the error to the next() function.
  // If the next() function receives an argument no mater what it is
  // Express.js will automatically know that there was an error
  // and will assume whatever we are passing as argument to be an error.
  // This applies to every single next() function in every single middleware in our application.
  // So whenever we pass in anything to next() it will assume it is an error
  // and it will skip all the other middlewares in the middleware stack
  // and send the error that we have passed in into our global error handling middleware
  // which then the error handling middleware will be executed.
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// ?Implementing Global Error Handling
// *You can read more about error handling with express in the what-is-express.txt file
// To define an error handling middleware all we have to do is to
// give the middleware function four arguments and express will automatically recognize
// it as error handling middleware and therefore only call it when there is an error.

// Just like in many other cases this middleware function is an error first function
app.use(globalErrorHandler);

module.exports = app;
