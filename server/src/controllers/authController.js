
const { createClient } = require("@supabase/supabase-js");

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

const supabase = require("../../config/supabase");

// ---------------------------------------------------------
// Supabase Password Authentication Client
// ---------------------------------------------------------
function createPasswordAuthClient() {
  const supabaseUrl = process.env.SUPABASE_URL;

  // Use the public key, never the service-role key,
  // for password authentication.
  const supabaseKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase URL or public API key."
    );
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

function invalidCredentials(res) {
  return res.status(401).json({
    errors: ["Invalid email or password."]
  });
}

// ---------------------------------------------------------
// UC-5: User Registration
// ---------------------------------------------------------
async function register(req, res) {
  const errors = validateRegistration(req.body || {});

  if (errors.length) {
    return res.status(400).json({ errors });
  }

  const { name, email, password } = req.body;
  const normalizedEmail = email.trim().toLowerCase();

  // Prevent duplicate local application accounts.
  if (UserRepository.findByEmail(normalizedEmail)) {
    return res.status(409).json({
      errors: [
        "An account with this email already exists."
      ]
    });
  }

  // Create the user in Supabase Auth first.
  // The same UUID is shared with profiles and tasks.
  const {
    data: authData,
    error: authError
  } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
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
    const user = await buildUser({
      name,
      email: normalizedEmail,
      password
    });

    user.id = supabaseUserId;

    UserRepository.create(user);

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

    try {
      const { error: cleanupError } =
        await supabase.auth.admin.deleteUser(
          supabaseUserId
        );

      if (cleanupError) {
        console.error(
          "Supabase user cleanup failed:",
          cleanupError
        );
      }
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
// Supports existing local users and missing local accounts.
// ---------------------------------------------------------
async function login(req, res) {
  const errors = validateLogin(req.body || {});

  if (errors.length) {
    return res.status(400).json({ errors });
  }

  const { email, password } = req.body;
  const normalizedEmail = email.trim().toLowerCase();

  let user = UserRepository.findByEmail(normalizedEmail);

  // -------------------------------------------------------
  // Existing local users:
  // Preserve the team's current password verification.
  // -------------------------------------------------------
  if (user) {
    if (!user.passwordHash) {
      return invalidCredentials(res);
    }

    const passwordMatches = await verifyPassword(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      return invalidCredentials(res);
    }

    return res.status(200).json({
      token: signToken(user),
      user: toPublicUser(user)
    });
  }

  // -------------------------------------------------------
  // Missing local user:
  // Verify credentials with Supabase and restore the record.
  // -------------------------------------------------------
  try {
    const authClient = createPasswordAuthClient();

    const {
      data,
      error
    } = await authClient.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (error) {
      // Invalid credentials remain 401.
      // Report unrelated Supabase outages as service errors.
      if (
        error.status === 400 ||
        error.status === 401 ||
        error.code === "invalid_credentials"
      ) {
        return invalidCredentials(res);
      }

      console.error(
        "Supabase password login failed:",
        error.message
      );

      return res.status(503).json({
        errors: [
          "Authentication service is temporarily unavailable."
        ]
      });
    }

    if (!data?.user) {
      return invalidCredentials(res);
    }

    const supabaseUser = data.user;

    const name =
      supabaseUser.user_metadata?.name ||
      supabaseUser.user_metadata?.full_name ||
      supabaseUser.email?.split("@")[0] ||
      normalizedEmail.split("@")[0];

    // The password has already been verified by Supabase.
    // Build a compatible application user record.
    const restoredUser = await buildUser({
      name,
      email: normalizedEmail,
      password
    });

    // Use the existing Supabase UUID.
    restoredUser.id = supabaseUser.id;

    // Avoid creating a duplicate on repeated requests.
    user = UserRepository.findByEmail(normalizedEmail);

    if (!user) {
      user = UserRepository.create(restoredUser);
    }

    if (user.id !== supabaseUser.id) {
      return res.status(409).json({
        errors: [
          "Account ID mismatch. Please contact the team."
        ]
      });
    }

    return res.status(200).json({
      token: signToken(user),
      user: toPublicUser(user)
    });

  } catch (error) {
    console.error(
      "Login recovery failed:",
      error
    );

    return res.status(500).json({
      errors: [
        "Could not complete login."
      ]
    });
  }
}

// ---------------------------------------------------------
// UC-5: OAuth Login
// ---------------------------------------------------------
async function oauthLogin(req, res) {
  const { access_token } = req.body || {};

  if (!access_token) {
    return res.status(400).json({
      errors: ["Missing OAuth access token."]
    });
  }

  const {
    data,
    error
  } = await supabase.auth.getUser(access_token);

  if (error || !data?.user) {
    return res.status(401).json({
      errors: [
        error?.message ||
        "Invalid or expired OAuth session."
      ]
    });
  }

  const supabaseUser = data.user;

  if (!supabaseUser.email) {
    return res.status(400).json({
      errors: [
        "OAuth account does not provide an email address."
      ]
    });
  }

  const name =
    supabaseUser.user_metadata?.name ||
    supabaseUser.user_metadata?.full_name ||
    supabaseUser.email.split("@")[0];

  let user = UserRepository.findById(
    supabaseUser.id
  );

  if (!user) {
    const existingByEmail =
      UserRepository.findByEmail(
        supabaseUser.email
      );

    if (existingByEmail) {
      if (existingByEmail.id !== supabaseUser.id) {
        return res.status(409).json({
          errors: [
            "An application account already exists with this email but is linked to a different user ID."
          ]
        });
      }

      user = existingByEmail;
    }
  }

  if (!user) {
    user = {
      id: supabaseUser.id,
      name,
      email: supabaseUser.email.toLowerCase(),
      createdAt: new Date().toISOString()
    };

    UserRepository.create(user);
  }

  const {
    error: profileError
  } = await supabase
    .from("profiles")
    .upsert(
      {
        id: supabaseUser.id,
        display_name: name
      },
      {
        onConflict: "id"
      }
    );

  if (profileError) {
    console.error(
      "OAuth profile setup failed:",
      profileError
    );

    return res.status(500).json({
      errors: [
        profileError.message ||
        "Could not complete OAuth profile setup."
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
// ---------------------------------------------------------
async function me(req, res) {
  const user = UserRepository.findById(
    req.user.id
  );

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
  oauthLogin,
  me
};
