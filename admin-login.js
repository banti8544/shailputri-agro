function adminLogin() {
  const username = document.getElementById("admin-username").value;
  const password = document.getElementById("admin-password").value;

  if (username === "owner" && password === "shailputri2026") {
    localStorage.setItem("isAdmin", "true");
    window.location.href = "admin.html";
  } else {
    document.getElementById("admin-message").textContent = "Invalid admin credentials";
  }
}