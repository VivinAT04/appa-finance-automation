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
    // CORS preflight must not depend on PostgreSQL startup.
    // Express/CORS can answer OPTIONS without application
    // database initialisation.
    if (req.method === "OPTIONS") {
      return app(req, res);
    }

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
