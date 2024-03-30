const mongoose = require("mongoose");
const slugify = require("slugify");
const validator = require("validator");

const tourSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "A tour must have a name"],
      maxlength: [
        40,
        "A tour name must have less than or equal to 40 characters.",
      ],
      minlength: [
        10,
        "A tour name must have more than or equal to 10 characters",
      ],
      validate: {
        validator: function (val) {
          return validator.isAlpha(val, "tr-TR", { ignore: " " });
        },
        message: "Tour must only contain letters",
      },
      unique: true,
      trim: true,
    },
    slug: String,
    duration: {
      type: Number,
      required: [true, "A tour must have a duration"],
    },
    maxGroupSize: {
      type: Number,
      required: [true, "A tour must have a group size"],
    },
    difficulty: {
      type: String,
      lowercase: true,
      required: [true, "A tour must have a difficulty"],
      enum: {
        values: ["easy", "medium", "difficult"],
        message: "A tour must have either easy, medium or difficult difficulty",
      },
    },
    ratingsAverage: {
      type: Number,
      default: 4.5,
      min: [1, "Rating must be higher than 1.0"],
      set: (val) => Number(val.toFixed(1)),
    },
    ratingsQuantity: {
      type: Number,
      default: 0,
    },
    price: {
      type: Number,
      required: [true, "A tour must have a price"],
    },
    priceDiscount: {
      type: Number,
      validate: {
        validator: function (val) {
          return val < this.price;
        },
        message: "priceDiscount ({VALUE}) must be lower than price",
      },
    },
    summary: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    imageCover: {
      type: String,
      trim: true,
      required: [true, "A tour must have a cove image"],
    },
    images: [String],
    createdAt: {
      type: Date,
      default: Date.now,
      select: false,
    },
    startDates: [Date],
    secretTour: {
      type: Boolean,
    },
    startLocation: {
      type: {
        type: String,
        default: "Point",
        enum: ["Point"],
      },
      coordinates: [Number],
      address: String,
      description: String,
    },
    locations: [
      {
        type: {
          type: String,
          default: "Point",
          enum: ["Point"],
        },
        coordinates: [Number],
        address: String,
        description: String,
        day: Number,
      },
    ],
    guides: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

tourSchema.virtual("durationWeeks").get(function () {
  return this.duration / 7;
});

tourSchema.virtual("reviews", {
  ref: "Review",
  foreignField: "tour",
  localField: "_id",
});

tourSchema.pre("save", function (next) {
  this.slug = slugify(this.name, { lower: true });
  next();
});

tourSchema.pre(/^find/, function (next) {
  this.find({ secretTour: { $exists: false } });
  this.start = Date.now();
  next();
});

tourSchema.pre(/^find/, function (next) {
  this.populate({
    path: "guides",
    select: "-__v -passwordChangedAt +role",
  });
  next();
});

tourSchema.pre("findOneAndUpdate", function (next) {
  this.setOptions({ runValidators: true });
  next();
});

tourSchema.post("find", function (docs, next) {
  const time = Date.now() - this.start;
  next();
});

tourSchema.pre("aggregate", function (next) {
  const pipeline = this.pipeline();
  if (Object.keys(pipeline[0])[0] === "$geoNear") {
    pipeline.splice(1, 0, { $match: { secretTour: { $exists: false } } });
  } else {
    this.pipeline().unshift({ $match: { secretTour: { $exists: false } } });
  }
  next();
});

const Tour = mongoose.model("Tour", tourSchema);

module.exports = Tour;
