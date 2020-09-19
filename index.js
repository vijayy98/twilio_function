const config = require('./config');
const connectDB = require("./config/db");
const voiceit2 = require('voiceit2-nodejs')
console.log("api key -->",config.apiKey , config.apiToken);

let myVoiceIt = new voiceit2(config.apiKey, config.apiToken);
var numTries = 0;

const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

const express = require('express')
const bodyParser = require('body-parser');
const User = require("./model/users");
const { json } = require('express');

// Connect Database
connectDB();

// const { Pool } = require('pg');
// const pool = new Pool({
//   connectionString: config.dataBaseURL,
//   ssl: true
// });

const PORT = process.env.PORT || 5000

express()
  .use(bodyParser.urlencoded({extended: true}))
  .use(bodyParser.json())
  .get("/getallusers",(req,res)=> getAllUsers(req,res))
  .post('/incoming_call', (req, res) => incomingCall(req, res))
  .post('/enroll_or_verify', (req, res) => enrollOrVerify(req, res))
  .post('/enroll', (req, res) => enroll(req, res))
  .post('/process_enrollment', (req, res) => processEnrollment(req, res))
  .post('/verify', (req, res) => verify(req, res))
  .post('/process_verification', (req, res) => processVerification(req, res))
  .post('/enroll_user', (req,res) => getuserInfo(req, res))
  .post('/store_name', (req, res) => storeName(req, res))
  .listen(PORT, () => console.log(`Listening on port ${ PORT }`))

  // --------------------------------------------
// VoiceIt authentication requires an email address, so we will make a fake
// one for this caller using the response body posted from Twilio.
var callerUserIdOLD = function(body) {
  // Twilio's `body.From` is the caller's phone number, so let's use it as
  // identifier in the VoiceIt profile. It also means, the authentication is
  // bound only to this phone number.
  return  {
    number   : body.From,
    email    : body.From + '@twiliobioauth.example.com',
    password : SHA256(body.From)
  };
};

const callerUserId = async (phone) => {
  try {
    // const client = await pool.connect()
    // const result = await client.query('SELECT userId FROM users where phone=\'' + phone + '\'');
    // client.release();
    let user = await User.findOne({ phone });

            if (user) {
                return user.userId;
            }

    // Check for user in db
    // if (Object.keys(result.rows).length !== 0) {
    //   return result.rows[0].userid;
    // }
  } catch (err) {
      console.error(err);
  }
  return 0
};

const getAllUsers = async (req,res) => {
  console.log("API hits---------------------->")
  let users = await User.find();
  console.log("waiting 4 users---------------------->")
            if (!users) {
                return res.status(500).json(users);
            }
            console.log("returning users---------------------->",users)
            res.status(200).json(users);

}

const getuserInfo = async (req, res) => {
  // console.log("getuserInfo ----->", req);
  console.log("getuserInfo body ----->", req.body);
  console.log("getuserInfo res ----->", res);
  console.log("getuserInfo res body ---->", res.body);
  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    // hints: 'cat, numbers, chuck',
    action: '/store_name',
    timeout: 3,
  });
  speak(gather, "Please say your name to enroll");
}

const storeName = async (req, res) => {

  console.log("storeName ----->", req);
  console.log("storeName body ----->", req.body);
  console.log("storeName res ----->", res);
  console.log("storeName res body ---->", res.body);

  const twiml = new VoiceResponse();
  const command = req.body.SpeechResult.toLowerCase();
  twiml.say(`You said ${command}. I'll give you a ${command} fact.`);

  /*const phone = removeSpecialChars(req.body.From);
  let user = await User.findOne({ phone });
  speak(twiml,'Thank you for calling voice its voice biometrics demo. Have a nice day!'+user.phone);
  user.name = "vijay";
  user.response = JSON.stringify(req.body);
  await User.update(user);
  const command = req.body.SpeechResult.toLowerCase();
  speak(twiml, 'You said your name is '+command+'.hi'+command);
  res.type('text/xml');
  res.send(twiml.toString());*/

}

const incomingCall = async (req, res) => {
  const twiml = new VoiceResponse();
  const phone = removeSpecialChars(req.body.From);
  const userId = await callerUserId(phone);

  // Check for user in VoiceIt db
  myVoiceIt.checkUserExists({
    userId :userId
  }, async (jsonResponse)=>{
    // User already exists
    if(jsonResponse.exists === true) {
      // Greet the caller when their account profile is recognized by the VoiceIt API.
      speak(twiml, "Welcome back to the Voice It Verification Demo, your phone number has been recognized");
      // Let's provide the caller with an opportunity to enroll by typing `1` on
      // their phone's keypad. Use the <Gather> verb to collect user input
      const gather = twiml.gather({
        action: '/enroll_or_verify',
        numDigits: 1,
        timeout: 5
      });
      speak(gather, "You may now log in, or press one to re enroll");
      twiml.redirect('/enroll_or_verify?digits=TIMEOUT');
      res.type('text/xml');
      res.send(twiml.toString());

    } else {
      // Create a new user for new number
      myVoiceIt.createUser(async (jsonResponse)=>{
        speak(twiml, "Welcome to the Voice It Verification Demo, you are a new user and will now be enrolled");
        try {
          user1 = new User({
            userId : jsonResponse.userId,
            phone: phone
        });
        await user1.save();
          // const client = await pool.connect()
          // const result = await client.query('insert into users values ('+ phone +', \'' + jsonResponse.userId + '\')');
          // client.release();
        } catch (err) {
          console.error(err);
          res.send("Error " + err);
        }

        twiml.redirect('/enroll');
        res.type('text/xml');
        res.send(twiml.toString());
      });
    }
  });
};

// Routing Enrollments & Verification
// ------------------------------------
// We need a route to help determine what the caller intends to do.
const enrollOrVerify = async (req, res) => {
  const digits = req.body.Digits;
  const phone = removeSpecialChars(req.body.From);
  const twiml = new VoiceResponse();
  const userId = await callerUserId(phone);
  // When the caller asked to enroll by pressing `1`, provide friendly
  // instructions, otherwise, we always assume their intent is to verify.
  if (digits == 1) {
    //Delete User's voice enrollments and re-enroll
    myVoiceIt.deleteAllEnrollments({
      userId: userId,
      }, async (jsonResponse)=>{
        console.log("deleteAllEnrollments JSON: ", jsonResponse.message);
        speak(twiml, "You have chosen to re enroll your voice, you will now be asked to say a phrase three times, then you will be able to log in with that phrase");
        twiml.redirect('/enroll');
        res.type('text/xml');
        res.send(twiml.toString());
    });

  } else {
    //Check for number of enrollments > 2
    myVoiceIt.getAllVoiceEnrollments({
      userId: userId
      }, async (jsonResponse)=>{
        speak(twiml, "You have chosen to verify your Voice.");
        console.log("jsonResponse.message: ", jsonResponse.message);
        const enrollmentsCount = jsonResponse.count;
        console.log("enrollmentsCount: ", enrollmentsCount);
        if(enrollmentsCount > 2){
          twiml.redirect('/verify');
          res.type('text/xml');
          res.send(twiml.toString());
        } else{
          speak(twiml, "You do not have enough enrollments and need to re enroll your voice.");
          //Delete User's voice enrollments and re-enroll
          myVoiceIt.deleteAllEnrollments({
            userId: userId,
            }, async (jsonResponse)=>{
              console.log("deleteAllEnrollments JSON: ", jsonResponse.message);
              twiml.redirect('/enroll');
              res.type('text/xml');
              res.send(twiml.toString());
          });
        }
    });
  }
};

// Enrollment Recording
const enroll = async (req, res) => {
  const enrollCount = req.query.enrollCount || 0;
  const twiml = new VoiceResponse();
  speak(twiml, 'Please say the following phrase to enroll ');
  speak(twiml, config.chosenVoicePrintPhrase, config.contentLanguage);

  twiml.record({
    action: '/process_enrollment?enrollCount=' + enrollCount,
    maxLength: 5,
    trim: 'do-not-trim'
  });
  res.type('text/xml');
  res.send(twiml.toString());
};

// Process Enrollment
const processEnrollment = async (req, res) => {
  const userId = await callerUserId(removeSpecialChars(req.body.From));
  var enrollCount = req.query.enrollCount;
  const recordingURL = req.body.RecordingUrl + ".wav";
  const twiml = new VoiceResponse();

  function enrollmentDone(){
      enrollCount++;
      // VoiceIt requires at least 3 successful enrollments.
      if (enrollCount > 2) {
        speak(twiml, 'Thank you, recording received, you are now enrolled and ready to log in');
        twiml.redirect('/verify');
      } else {
        speak(twiml, 'Thank you, recording received, you will now be asked to record your phrase again');
        twiml.redirect('/enroll?enrollCount=' + enrollCount);
      }
  }

  function enrollAgain(){
    speak(twiml, 'Your recording was not successful, please try again');
    twiml.redirect('/enroll?enrollCount=' + enrollCount);
  }

  // Sleep and wait for Twillio to make file available
  await new Promise(resolve => setTimeout(resolve, 1000));
  myVoiceIt.createVoiceEnrollmentByUrl({
    userId: userId,
	  audioFileURL: recordingURL,
    phrase: config.chosenVoicePrintPhrase,
	  contentLanguage: config.contentLanguage,
	}, async (jsonResponse)=>{
      console.log("createVoiceEnrollmentByUrl json: ", jsonResponse.message);
      if ( jsonResponse.responseCode === "SUCC" ) {
        enrollmentDone();
      } else {
        enrollAgain();
      }

    res.type('text/xml');
    res.send(twiml.toString());
  });
}

// Verification Recording
const verify = async (req, res) => {
  var twiml = new VoiceResponse();

  speak(twiml, 'Please say the following phrase to verify your voice ');
  speak(twiml, config.chosenVoicePrintPhrase, config.contentLanguage);

  twiml.record({
    action: '/process_verification',
    maxLength: '5',
    trim: 'do-not-trim',
  });
  res.type('text/xml');
  res.send(twiml.toString());
};

// Process Verification
const processVerification = async (req, res) => {
  
  console.log("processVerification ----->", req);
  console.log("processVerification body ----->", req.body);
  console.log("processVerification res ----->", res);
  console.log("processVerification res body ---->", res.body);

  const userId = await callerUserId(removeSpecialChars(req.body.From));
  const recordingURL = req.body.RecordingUrl + '.wav';
  const twiml = new VoiceResponse();

  // Sleep and wait for Twillio to make file available
  await new Promise(resolve => setTimeout(resolve, 1000));
  myVoiceIt.voiceVerificationByUrl({
    userId: userId,
  	audioFileURL: recordingURL,
    phrase: config.chosenVoicePrintPhrase,
  	contentLanguage: config.contentLanguage,
  	}, async (jsonResponse)=>{
      console.log("createVoiceVerificationByUrl: ", jsonResponse.message);

      if (jsonResponse.responseCode == "SUCC") {
        speak(twiml, 'Verification successful! for user '+userId);
        // speak(twiml,'Thank you for calling voice its voice biometrics demo. Have a nice day!');
        const gather = twiml.gather({
          action: '/enroll_user',
          numDigits: 2,
          timeout: 3
        });
        speak(gather, "You can now log in,before that press two for store user information");
        //Hang up
      } else if (numTries > 2) {
        //3 attempts failed
        speak(twiml,'Too many failed attempts. Please call back and select option 1 to re enroll and verify again.');
      } else {
        switch (jsonResponse.responseCode) {
          case "STTF":
              speak(twiml, "Verification failed. It seems you may not have said your enrolled phrase. Please try again.");
              numTries = numTries + 1;
              twiml.redirect('/verify');
              break;
          case "FAIL":
              speak(twiml,"Your verification did not pass, please try again.");
              numTries = numTries + 1;
              twiml.redirect('/verify');
              break;
          case "SSTQ":
              speak(twiml,"Please speak a little louder and try again.");
              numTries = numTries + 1;
              twiml.redirect('/verify');
              break;
          case "SSTL":
              speak(twiml,"Please speak a little quieter and try again.");
              numTries = numTries + 1;
              twiml.redirect('/verify');
              break;
          default:
              speak(twiml,"Something went wrong. Your verification did not pass, please try again.");
              numTries = numTries + 1;
              twiml.redirect('/verify');
          }
      }
      res.type('text/xml');
      res.send(twiml.toString());
  });

};

function speak(twiml, textToSpeak, contentLanguage = "en-US"){
  twiml.say(textToSpeak, {
    voice: "alice",
    language: contentLanguage
  });
}

function removeSpecialChars(text){
  return text.replace(/[^0-9a-z]/gi, '');
}
