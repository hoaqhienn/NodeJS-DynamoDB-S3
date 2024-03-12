const express = require("express");
const PORT = 3000;
const app = express();

const multer = require("multer");
const AWS = require("aws-sdk");
require("dotenv").config();
const path = require("path");
const { contentType } = require("express/lib/response");

process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MESSAGE = "1";

AWS.config.update({
  region: process.env.REGION,
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

const bucketName = process.env.S3_BUCKET_NAME;
const tableName = process.env.DYNAMODB_TABLE_NAME;

const storage = multer.memoryStorage({
  destination(req, file, callback) {
    callback(null, "");
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2000000 },
  fileFilter(req, file, cb) {
    checkFileType(file, cb);
  },
});

function checkFileType(file, cb) {
  const fileTypes = /jpeg|jpg|png|gif/;

  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = fileTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  }
  return cb("Error: only png or jpg!");
}

// app.use(express.urlencoded({ extends: true }));
app.use(express.static("./views"));

app.set("view engine", "ejs");
app.set("views", "./views");

app.get("/", async (req, res) => {
  try {
    const params = { TableName: tableName };
    const data = await dynamodb.scan(params).promise();
    console.log("data", data.Items);
    return res.render("index.ejs", { data: data.Items });
  } catch (error) {
    console.log("Khong the lay du lieu tu dynamoDB!", error);
    return res.status(500).send("Internal Server Error");
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

app.post("/save", upload.single("image"), async (req, res) => {
  try {
    const id = Number(req.body.id);
    const name = req.body.name;
    const quantity = Number(req.body.quantity);
    const price = Number(req.body.price);

    const image = req.file?.originalname.split(".");
    const fileType = image[image.length - 1];
    const filePath = `${id}_${Date.now().toString()}.${fileType}`;

    const paramsS3 = {
      Bucket: bucketName,
      Key: filePath,
      Body: req.file.buffer,
      contentType: req.file.mimetype,
    };

    s3.upload(paramsS3, async (err, data) => {
      if (err) {
        console.log("Error uploading image to S3", err);
        return res.status(500).send("Internal Server Error");
      }

      const paramsDynamoDB = {
        TableName: tableName,
        Item: {
          id,
          name,
          quantity,
          price,
          image: data.Location,
        },
      };

      try {
        await dynamodb.put(paramsDynamoDB).promise();
        console.log("Data saved to DynamoDB");
        return res.redirect("/");
      } catch (error) {
        console.log("Khong the luu du lieu vao dynamoDB!", error);
        return res.status(500).send("Internal Server Error");
      }
    });
  } catch (error) {
    console.log("Error saving data", error);
    return res.status(500).send("Internal Server Error");
  }
});

app.post("/delete", upload.fields([]), (req, res) => {
  const listCheckboxSelected = Object.keys(req.body);
  if (!listCheckboxSelected || listCheckboxSelected.length <= 0) {
    return res.redirect("/");
  }
  try {
    const params = {
      RequestItems: {
        [tableName]: listCheckboxSelected.map((id) => ({
          DeleteRequest: {
            Key: {
              id: Number(id),
            },
          },
        })),
      },
    };
    dynamodb.batchWrite(params, (err, data) => {
      if (err) {
        console.log("Error deleting data", err);
        return res.status(500).send("Internal Server Error");
      }
      console.log("Data deleted from DynamoDB");
      return res.redirect("/");
    });
  } catch (error) {
    console.log("Error deleting data", error);
    return res.status(500).send("Internal Server Error");
  }
});
