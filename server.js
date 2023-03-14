// Load environment variables from .env file
require('dotenv').config();
const AWS = require('aws-sdk');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const router = express.Router();
const app = express();
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const AmazonCognitoIdentity = require('amazon-cognito-identity-js');
const path = require('path');



app.set('view engine', 'ejs');

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'us-east-2', // Credentials configuration
});



const poolData = {
    UserPoolId: process.env.AWS_COGNITO_USER_POOL_ID,
    ClientId: process.env.AWS_COGNITO_CLIENT_ID
};
const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

// Use middleware to parse cookies and form data
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Define the login route handler
app.post('/login', (req, res) => {
    const email = req.body.email;
    const password = req.body.password;

    // Authenticate the user against the Cognito user pool
    const authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails({
        Username: email,
        Password: password
    });

    const userData = {
        Username: email,
        Pool: userPool
    };

    const cognitoUser = new AmazonCognitoIdentity.CognitoUser(userData);

    cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (result) => {
            const accessToken = result.getAccessToken().getJwtToken();
            console.log('Access Token:', accessToken);
            // Set the access token as a cookie
            res.cookie('accessToken', accessToken, {
                httpOnly: true,
                secure: true
            });
            res.redirect('/')
            //res.status(200).send({ message: 'Authentication successful' });
        },
        onFailure: (err) => {
            console.log(err);
            res.status(401).send({ message: 'Invalid email address or password' });
        }
    });
});



function requireAuth(req, res, next) {
    const accessToken = req.cookies.accessToken;

    if (!accessToken) {
        return res.redirect('/login');
    }

    next();
}


app.get('/', requireAuth, (req, res) => {
    res.render('index');
});


// Define the login route handler
app.get('/login', (req, res) => {
    // Render the login page
    res.sendFile(path.join(__dirname, 'public/login.html'));
});












const s3 = new AWS.S3();

// Serve the static files (index.html and scripts.js) from the public directory
app.use(express.static('public'));




app.use(['/upload', '/videos'], requireAuth);

// Define the upload route handler
app.get('/upload', requireAuth,(req, res) => {
    res.render('upload');
});

// Define the videos route handler
app.get('/videos', requireAuth, (req, res) => {
    // Specify the S3 bucket and key prefix for your videos and thumbnails
    const bucket = 'awesomewebsitebucket';
    const prefix = 'videos/';

    // Use the AWS SDK to fetch objects from your S3 bucket
    s3.listObjects({ Bucket: bucket, Prefix: prefix }, (err, data) => {
        if (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        } else {
            // Extract the list of video objects from the response data
            const videos = data.Contents.filter((object) => {
                return object.Key.endsWith('.mp4') || object.Key.endsWith('.mov');
            }).map((object) => {
                const videoKey = object.Key.replace(`${prefix}`, '');
                const videoUrl = `https://${bucket}.s3.amazonaws.com/${object.Key}`;
                const thumbnailKey = `${videoKey.replace(/\.[^/.]+$/, '')}.JPG`;
                const thumbnailUrl = `https://${bucket}.s3.amazonaws.com/thumbnails/${thumbnailKey}`;
                const videoLink = `https://${bucket}.s3.amazonaws.com/${object.Key}`;
                return {
                    key: videoKey,
                    url: videoLink,
                    thumbnailUrl: thumbnailUrl,
                };
            });

            // Send the list of videos to the frontend as JSON
            res.json(videos);
        }
    });
});

// Define the requireAuth middleware function
function requireAuth(req, res, next) {
    const accessToken = req.cookies.accessToken;


    // Allow access to the login page without authentication
    if (req.path === '/login') {
        return next();
    }

    if (!accessToken) {
        return res.redirect('/login');
    }


    next();
}

// Define the upload route handler
app.post('/upload', upload.fields([{ name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), (req, res) => {
    const videoFile = req.files['video'][0];
    const thumbnailFile = req.files['thumbnail'][0];

    const videoStream = fs.createReadStream(videoFile.path);
    const thumbnailStream = fs.createReadStream(thumbnailFile.path);

    const videoName = videoFile.originalname.split('.').slice(0, -1).join('.');

    const videoUploadParams = {
        Bucket: 'awesomewebsitebucket',
        Key: `videos/${videoName}.${videoFile.originalname.split('.').pop()}`,
        Body: videoStream,
        ContentDisposition: 'inline', // set Content-Disposition header to inline
        ContentType: videoFile.mimetype // set the content type of the video file
    };

    const thumbnailUploadParams = {
        Bucket: 'awesomewebsitebucket',
        Key: `thumbnails/${videoName}.JPG`,
        Body: thumbnailStream,
        ContentType: 'image/jpeg'
    };



    s3.upload(videoUploadParams, (err, videoData) => {
        if (err) {
            console.log("Error uploading video file to S3:", err);
            res.status(500).send('Internal Server Error');
        } else {
            console.log("Video file uploaded to S3 successfully:", videoData.Location);
            s3.upload(thumbnailUploadParams, (err, thumbnailData) => {
                if (err) {
                    console.log("Error uploading thumbnail file to S3:", err);
                    res.status(500).send('Internal Server Error');
                } else {
                    console.log("Thumbnail file uploaded to S3 successfully:", thumbnailData.Location);
                    res.redirect('/');
                }
            });
        }
    });
});


const port = process.env.PORT || 443;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});