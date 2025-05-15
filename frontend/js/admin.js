document.addEventListener("DOMContentLoaded", initializeAdminPanel);

// Authentication check function get the token details.
function checkAuth() {
    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "index.html";
        return false;
    }

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.role !== 'admin') {
            alert('Unauthorized access');
            localStorage.clear();
            window.location.href = "index.html";
            return false;
        }
    } catch (error) {
        console.error('Token validation error:', error);
        localStorage.clear();
        window.location.href = "index.html";
        return false;
    }

    return true;
}

// Initialize Admin Panel
function initializeAdminPanel() {
    if (!checkAuth()) return;

    document.getElementById("logoutBtn").addEventListener("click", logout);
    document.getElementById("addUserBtn").addEventListener("click", openUserForm);
    document.getElementById("createUserBtn").addEventListener("click", createUser);
    loadSubmissions();
    setupSecurityMeasures();
}

// Logout Function
function logout() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "index.html";
}

// Security Measures NAVIGATION
function setupSecurityMeasures() {
    window.history.pushState(null, null, window.location.href);
    window.addEventListener('popstate', () => window.history.pushState(null, null, window.location.href));

    document.addEventListener('contextmenu', e => e.preventDefault());

    document.addEventListener('keydown', e => {
        if (
            (e.altKey && e.keyCode === 37) || // Alt + Left Arrow
            (e.keyCode === 8 && e.target === document.body) || // Backspace navigation prevention
            (e.altKey && e.keyCode === 39) // Alt + Right Arrow
        ) {
            e.preventDefault();
        }
    });

    // Session timeout (30 min)
    const SESSION_TIMEOUT = 30 * 60 * 1000;
    const sessionStart = new Date().getTime();

    setInterval(() => {
        if (new Date().getTime() - sessionStart > SESSION_TIMEOUT) {
            alert("Session expired. Please login again.");
            logout();
        }
    }, 60000);

    // Regular auth check
    setInterval(checkAuth, 5000);
}

// Open Add User Form
function openUserForm() {
    document.getElementById("userForm").style.display = "block";
}

// Create User
function createUser() {
    if (!checkAuth()) return;

    const username = document.getElementById('newUsername').value.trim();
    const domain = document.getElementById('newUserDomain').value.trim();
    const password = document.getElementById('newUserPassword').value.trim();
    const role = document.getElementById('newUserRole').value; // Get role value

    // Get token from localStorage
    const token = localStorage.getItem('token');
    if (!token) {
        alert("❌ Authentication token missing. Please log in again.");
        return;
    }

    if (!username || !domain || !password || !role) {
        alert('⚠️ Please fill all fields');
        return;
    }

    fetch('http://localhost:5000/api/admin/addUser', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`  // Use token here
        },
        body: JSON.stringify({ username, password, role, domain })
    })
        .then(res => res.json())
        .then(data => {
            alert(data.message || "✅ User created successfully!");
            console.log(data);
        })
        .catch(error => console.error("🔥 Error creating user:", error));
}
// to create a task from the panel
function createTask() {
    if (!checkAuth()) return;

    const domain = document.getElementById('taskDomain').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const deadline = document.getElementById('taskDeadline').value.trim();

    // Get token from localStorage
    const token = localStorage.getItem('token');
    if (!token) {
        alert("❌ Authentication token missing. Please log in again.");
        return;
    }

    if (!domain || !description || !deadline) {
        alert('⚠️ Please fill all fields');
        return;
    }

    fetch('http://localhost:5000/api/admin/createTask', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ domain, description, deadline })
    })
        .then(res => res.json())
        .then(data => {
            alert(data.message || "✅ Task created successfully!");
            console.log(data);
        })
        .catch(error => console.error("🔥 Error creating task:", error));
}


// Load Task Submissions
function loadSubmissions() {
    if (!checkAuth()) return;
    const token = localStorage.getItem("token");
    const submissionsList = document.getElementById("submissionsList");
    submissionsList.innerHTML = '<p>Loading submissions...</p>';

    fetch("http://localhost:5000/api/admin/submissions", {
        headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/json"
        }
    })
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
        })
        .then(submissions => {
            if (!Array.isArray(submissions)) throw new Error("Invalid submission data received");

            submissionsList.innerHTML = submissions.length ? '' : '<p>No submissions found</p>';

            submissions.forEach(submission => {
                const username = submission.userId?.username || "Unknown User";
                const taskDescription = submission.taskId?.description || "Unknown Task";
                const submissionId = submission._id || "unknown";

                const submissionElement = document.createElement('div');
                submissionElement.className = 'submission';
                submissionElement.innerHTML = `
                <div class="submission-header">
                    <p><strong>User:</strong> ${username}</p>
                    <p><strong>Task:</strong> ${taskDescription}</p>
                </div>
                <div class="submission-status">
                    <p id="status-${submissionId}">Status: ${submission.status || 'Pending'}</p>
                </div>
                <div class="submission-content">
                    ${submission.fileUrl ?
                        `<a href="${submission.fileUrl}" target="_blank" class="view-link">View Submission</a>` :
                        '<p class="no-file">No file submitted</p>'
                    }
                </div>
                <br>
                <div class="submission-actions">
                    <button onclick="reviewSubmission('${submissionId}', 'Approved')" class="approve-btn">Approve</button>
                    <button onclick="reviewSubmission('${submissionId}', 'Rejected')" class="reject-btn">Reject</button>
                </div>
            `;

                submissionsList.appendChild(submissionElement);
            });
        })
        .catch(error => {
            console.error("Error loading submissions:", error);
            submissionsList.innerHTML = `
            <div class="error-message">
                <p>Error loading submissions: ${error.message}</p>
                <button onclick="loadSubmissions()" class="retry-btn">Retry</button>
            </div>
        `;
        });
}

// Review Task Submission (Approve/Reject)
function reviewSubmission(id, status) {
    if (!checkAuth()) return;
    const token = localStorage.getItem("token");

    fetch("http://localhost:5000/api/admin/reviewSubmission", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ submissionId: id, status })
    })
        .then(res => res.json())
        .then(() => loadSubmissions())
        .catch(error => console.error("Error reviewing submission:", error));
}
