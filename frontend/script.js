const supabase = window.supabase.createClient(window.ENV.SUPABASE_URL, window.ENV.SUPABASE_ANON_KEY);
const form = document.getElementById("registrationForm");
const errorMessage = document.getElementById("errorMessage");
const successMessage = document.getElementById("successMessage");


form.addEventListener("submit", async function (e) {
  e.preventDefault(); // prevent form submit for now

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  // Clear previous errors
  errorMessage.textContent = "";
  successMessage.textContent = "";


  // ===========================
  // NAME CHECK: Full name required
  // ===========================
  // full name = at least 2 words
  const nameWords = name.split(" ").filter(word => word.length > 0);

  if (nameWords.length < 2) {
    errorMessage.textContent = "Please enter your full name (first and last).";
    return;
  }

  // ===========================
  // EMAIL BASIC CHECK (HTML already does most)
  // ===========================
  if (!email.includes("@") || !email.includes(".")) {
    errorMessage.textContent = "Please enter a valid email address.";
    return;
  }

  // ===========================
  // PASSWORD CHECKS
  // ===========================

  // 1. Length
  if (password.length < 8) {
    errorMessage.textContent = "Password must be at least 8 characters long.";
    return;
  }

  // 2. At least 1 number
  if (!/\d/.test(password)) {
    errorMessage.textContent = "Password must contain at least one number.";
    return;
  }

  // 3. At least 1 uppercase letter
  if (!/[A-Z]/.test(password)) {
    errorMessage.textContent = "Password must contain at least one uppercase letter.";
    return;
  }

  // 4. At least 1 lowercase letter
  if (!/[a-z]/.test(password)) {
    errorMessage.textContent = "Password must contain at least one lowercase letter.";
    return;
  }

  // ===========================
  // PASSWORD MATCH CHECK
  // ===========================
  if (password !== confirmPassword) {
    errorMessage.textContent = "Passwords do not match.";
    return;
  }

// ===========================
// SUCCESS
// ===========================
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: { name }
  }
});

if (error) {
  errorMessage.style.color = "red";
  errorMessage.textContent = error.message;
  return;
}

successMessage.textContent = "Registration successful!";
form.reset();
});

