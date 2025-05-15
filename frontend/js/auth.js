function login() {
    const username = $("#username").val();
    const password = $("#password").val();

    $.ajax({
        url: "http://localhost:5000/api/auth/login",
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({ username, password }),
        success: function (data) {
            if (data.token) {
                console.log("✅ Login Successful. Token:", data.token);
                localStorage.setItem("token", data.token);
                window.location.href = data.role === "admin" ? "admin.html" : "user.html";
            } else {
                alert("❌ Invalid Credentials");
            }
        },
        error: function (xhr, status, error) {
            console.error("🔥 Login Error:", error);
        }
    });
}
