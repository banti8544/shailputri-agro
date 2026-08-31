function showSignup() {
  document.getElementById("login-section").style.display = "none";
  document.getElementById("signup-section").style.display = "block";
}

function showLogin() {
  document.getElementById("signup-section").style.display = "none";
  document.getElementById("login-section").style.display = "block";
}

async function signup() {
  const businessName = document.getElementById("signup-business").value;
  const username = document.getElementById("signup-username").value;
  const password = document.getElementById("signup-password").value;

  const response = await fetch('http://localhost:3000/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ businessName, username, password })
  });

  const result = await response.json();
  document.getElementById("signup-message").textContent = result.message;

  if (result.success) {
    showLogin();
  }
}

async function login() {
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;

  const response = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const result = await response.json();

  if (result.success) {
    localStorage.setItem("businessName", result.businessName);
    localStorage.setItem("username", result.username);
    window.location.href = "index.html";
  } else {
    document.getElementById("login-message").textContent = result.message;
  }
}