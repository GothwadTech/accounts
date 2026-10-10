import { passwordStrength } from '../../../js/common.js';

export function initPasswordStrengthMeter(passwordInput, strengthFill, strengthText) {
  if (!passwordInput || !strengthFill || !strengthText) return;

  passwordInput.addEventListener('input', () => {
    const score = passwordStrength(passwordInput.value);
    const labels = ['Very weak', 'Weak', 'Okay', 'Good', 'Strong! 💪'];
    const colors = ['#f04747', '#f04747', '#d4a72c', '#2ea86e', '#2ea86e'];
    strengthFill.style.width = `${score * 25}%`;
    strengthFill.style.background = colors[score];
    strengthText.textContent = passwordInput.value
      ? labels[score]
      : 'Use 8+ characters with mixed case, numbers & symbols.';
  });
}
