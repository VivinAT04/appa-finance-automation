const {
  app,
  initialiseApplication,
} = require("../src/server");

let initialisationPromise = null;

function ensureInitialised() {
  if (!initialisationPromise) {
    initialisationPromise =
      initialiseApplication();
  }

  return initialisationPromise;
}

module.exports = async function handler(
  req,
  res
) {
  try {
    await ensureInitialised();

    return app(req, res);
  } catch (error) {
    console.error(
      "APPA Vercel initialisation failed:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Application initialisation failed.",
    });
  }
};
