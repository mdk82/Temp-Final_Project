const VoiceResponse = require("twilio").twiml.VoiceResponse;
const SurveyResponse = require("../models/SurveyResponse");
const survey = require("../survey_data");

// Main interview loop
exports.interview = (request, response) => {
  let phone = request.body.From;
  let input = request.body.RecordingUrl || request.body.Digits;
  let twiml = new VoiceResponse();

  // helper to append a new "Say" verb with alice voice
  function say(text) {
    twiml.say({ voice: "alice" }, text);
  }

  // respond with the current TwiML content
  function respond() {
    response.type("text/xml");
    response.send(twiml.toString());
  }

  // Find an in-progess survey if one exists, otherwise create one
  SurveyResponse.advanceSurvey(
    {
      phone: phone,
      input: input,
      survey: survey
    },
    function(err, surveyResponse, questionIndex) {
      let question = survey[questionIndex];

      if (err || !surveyResponse) {
        say("Terribly sorry, but an error has occurred. Goodbye.");
        return respond();
      }

      // If question is null, we're done!
      if (!question) {
        say("Thank you for taking this survey. Goodbye!");
        return respond();
      }

      // Add a greeting if this is the first question
      if (questionIndex === 0) {
        say(
          "Thank you for taking our survey. Please listen carefully " +
            "to the following questions."
        );
      }

      // Otherwise, ask the next question
      say(question.text);

      // Depending on the type of question, we either need to get input via
      // DTMF tones or recorded speech
      if (question.type === "text") {
        say(
          "Please record your response after the beep. " +
            "Press any key to finish."
        );
        twiml.record({
          transcribe: true,
          transcribeCallback:
            "/voice/" + surveyResponse._id + "/transcribe/" + questionIndex,
          maxLength: 60
        });
      } else if (question.type === "boolean") {
        say('Press one for "yes", and any other key for "no".');
        twiml.gather({
          timeout: 10,
          numDigits: 1
        });
      } else {
        // Only other supported type is number
        say(
          "Enter the number using the number keys on your telephone." +
            " Press star to finish."
        );
        twiml.gather({
          timeout: 10,
          finishOnKey: "*"
        });
      }

      // render TwiML response
      respond();
    }
  );
};

// Transcripton callback - called by Twilio with transcript of recording
// Will update survey response outside the interview call flow
exports.transcription = (request, response) => {
  let responseId = request.params.responseId;
  let questionIndex = request.params.questionIndex;
  let transcript = request.body.TranscriptionText;

  SurveyResponse.findById(responseId, (err, surveyResponse) => {
    if (err || !surveyResponse || !surveyResponse.responses[questionIndex])
      return response.status(500).end();

    // Update appropriate answer field
    surveyResponse.responses[questionIndex].answer = transcript;
    surveyResponse.markModified("responses");
    surveyResponse.save((err, doc) => {
      return response.status(err ? 500 : 200).end();
    });
  });
};
