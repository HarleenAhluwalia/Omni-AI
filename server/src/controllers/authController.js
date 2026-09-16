const { UserRepository } = require("../config/db");

const {
  buildUser,
  verifyPassword,
  toPublicUser
} = require("../models/User");

const {
  validateRegistration,
  validateLogin
} = require("../utils/validators");

const { signToken } = require("../middleware/auth");

// Supabase server client.
// This uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// from server/.env.
const supabase = require("../../config/supabase");


// ---------------------------------------------------------
// UC-5: User Registration
// ---------------------------------------------------------
async function register(req, res) {
  const errors = validateRegistration(req.body || {});

  if (errors.length) {
    return res.status(400).json({ errors });
  }

  const { name, email, password } = req.body;

  // Prevent duplicate application accounts.
  if (UserRepository.findByEmail(email)) {
    return res.status(409).json({
      errors: [
        "An account with this email already exists."
      ]
    });
  }

  // -------------------------------------------------------
  // Create the user in Supabase Auth first.
  //
  // This is important because:
  //
  // auth.users.id
  //        ↓
  // public.profiles.id
  //        ↓
  // public.tasks.user_id
  //
  // All three need to use the SAME UUID.
  // -------------------------------------------------------
  const {
    data: authData,
    error: authError
  } = await supabase.auth.admin.createUser({
    email,
    password,

    // Sprint 1:
    // Confirm the development account immediately so
    // authentication testing does not depend on email confirmation.
    email_confirm: true,

    user_metadata: {
      name
    }
  });

  if (authError || !authData?.user) {
    return res.status(500).json({
      errors: [
        authError?.message ||
          "Could not create authentication user."
      ]
    });
  }

  const supabaseUserId = authData.user.id;

  try {
    // -----------------------------------------------------
    // Keep the team's existing local/application user model.
    // The important change is that its ID now matches
    // the Supabase Auth UUID.
    // -----------------------------------------------------
    const user = await buildUser({
      name,
      email,
      password
    });

    user.id = supabaseUserId;

    UserRepository.create(user);

    // -----------------------------------------------------
    // Ensure public.profiles contains the same UUID.
    //
    // upsert is used because the database may already have
    // a signup trigger that creates this profile.
    // -----------------------------------------------------
    const {
      error: profileError
    } = await supabase
      .from("profiles")
      .upsert(
        {
          id: supabaseUserId,
          display_name: name,
          onboarding_completed: false
        },
        {
          onConflict: "id"
        }
      );

    if (profileError) {
      throw new Error(profileError.message);
    }

    const token = signToken(user);

    return res.status(201).json({
      token,
      user: toPublicUser(user)
    });

  } catch (error) {
    console.error(
      "Registration setup failed:",
      error
    );

    // If application/profile setup failed after creating
    // the Supabase Auth user, remove that Auth user so we
    // do not leave a partially created account.
    try {
      await supabase.auth.admin.deleteUser(
        supabaseUserId
      );
    } catch (cleanupError) {
      console.error(
        "Supabase user cleanup failed:",
        cleanupError
      );
    }

    return res.status(500).json({
      errors: [
        error.message ||
          "Could not complete registration."
      ]
    });
  }
}


// ---------------------------------------------------------
// UC-5: User Login
// ---------------------------------------------------------
async function login(req, res) {
  const errors = validateLogin(req.body || {});

  if (errors.length) {
    return res.status(400).json({ errors });
  }

  const { email, password } = req.body;

  const user =
    UserRepository.findByEmail(email);

  if (!user) {
    return res.status(401).json({
      errors: [
        "Invalid email or password."
      ]
    });
  }

  const passwordMatches =
    await verifyPassword(
      password,
      user.passwordHash
    );

  if (!passwordMatches) {
    return res.status(401).json({
      errors: [
        "Invalid email or password."
      ]
    });
  }

  const token = signToken(user);

  return res.status(200).json({
    token,
    user: toPublicUser(user)
  });
}


// ---------------------------------------------------------
// GET CURRENT USER
// Used by frontend AuthContext when restoring a session.
// ---------------------------------------------------------
async function me(req, res) {
  const user =
    UserRepository.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      error: "User not found."
    });
  }

  return res.status(200).json({
    user: toPublicUser(user)
  });
}


module.exports = {
  register,
  login,
  me
};