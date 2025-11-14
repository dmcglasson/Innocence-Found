/**
 * Validation Utilities
 * 
 * Helper functions for form validation and data validation.
 * Includes XSS prevention and input sanitization.
 */

/**
 * Sanitize string input to prevent XSS
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeString(input) {
  if (typeof input !== 'string') {
    return '';
  }
  
  // Remove potentially dangerous characters
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @param {number} minLength - Minimum length (default: 6)
 * @returns {Object} Validation result with isValid and message
 */
export function validatePassword(password, minLength = 6) {
  if (!password || typeof password !== 'string') {
    return { isValid: false, message: "Password is required" };
  }

  if (password.length < minLength) {
    return {
      isValid: false,
      message: `Password must be at least ${minLength} characters long`,
    };
  }

  // Check for common weak passwords
  const weakPasswords = ['password', '123456', '12345678', 'qwerty', 'abc123'];
  if (weakPasswords.includes(password.toLowerCase())) {
    return {
      isValid: false,
      message: "Password is too common. Please choose a stronger password.",
    };
  }

  return { isValid: true, message: "Password is valid" };
}

/**
 * Validate form data
 * @param {Object} formData - Form data object
 * @param {Object} rules - Validation rules
 * @returns {Object} Validation result with isValid and errors
 */
export function validateForm(formData, rules) {
  const errors = {};
  let isValid = true;

  Object.keys(rules).forEach((field) => {
    const value = formData[field];
    const rule = rules[field];

    // Required check
    if (rule.required && (!value || (typeof value === 'string' && value.trim() === ""))) {
      errors[field] = `${field} is required`;
      isValid = false;
      return;
    }

    // Skip further validation if value is empty and not required
    if (!value || (typeof value === 'string' && value.trim() === "")) {
      return;
    }

    // Sanitize string inputs
    let sanitizedValue = value;
    if (typeof value === 'string') {
      sanitizedValue = sanitizeString(value);
      if (sanitizedValue !== value) {
        errors[field] = `${field} contains invalid characters`;
        isValid = false;
        return;
      }
    }

    // Email validation
    if (rule.type === "email" && value) {
      if (!isValidEmail(value)) {
        errors[field] = "Invalid email format";
        isValid = false;
        return;
      }
    }

    // Password validation
    if (rule.type === "password" && value) {
      const passwordValidation = validatePassword(value, rule.minLength);
      if (!passwordValidation.isValid) {
        errors[field] = passwordValidation.message;
        isValid = false;
        return;
      }
    }

    // Min length check
    if (rule.minLength && value && typeof value === 'string' && value.length < rule.minLength) {
      errors[field] = `${field} must be at least ${rule.minLength} characters`;
      isValid = false;
      return;
    }

    // Max length check
    if (rule.maxLength && value && typeof value === 'string' && value.length > rule.maxLength) {
      errors[field] = `${field} must be no more than ${rule.maxLength} characters`;
      isValid = false;
      return;
    }
  });

  return { isValid, errors };
}
