// Authentication check function
function checkAuth() {
    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "index.html";
        return false;
    }
    return true;
}

// Prevent going back after logout-->navigation
function preventBack() {
    window.history.forward();
}

setTimeout(preventBack, 0);
window.addEventListener("beforeunload", function () { null });

document.addEventListener("DOMContentLoaded", async () => {
    if (!checkAuth()) return;

    const taskList = document.getElementById("taskList");
    const taskSelect = document.getElementById("taskId");
    const submissionForm = document.getElementById("submissionForm");
    const responseMessage = document.getElementById("responseMessage");
    const logoutBtn = document.getElementById("logoutBtn");
    const fileUpload = document.getElementById("fileUpload");
    const submissionsList = document.getElementById("submissionsList");
    const uploadProgress = document.querySelector(".upload-progress");
    const uploadProgressContainer = document.querySelector(".upload-progress-container");

    // Add file type validation
    const allowedFileTypes = [
        'image/jpeg',
        'image/png',
        'image/jpg',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    const maxFileSize = 5 * 1024 * 1024; // 5MB

    // Function to format date
    function formatDate(dateString) {
        const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        return new Date(dateString).toLocaleDateString('en-US', options);
    }

    // Function to load submissions history
    async function loadSubmissions() {
        const token = localStorage.getItem("token");
        if (!token) return;

        try {
            const response = await fetch("http://localhost:5000/api/user/submissions", {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            const submissions = await response.json();

            if (submissions.error) throw new Error(submissions.error);

            submissionsList.innerHTML = submissions.length ? "" : "<p>No submissions yet</p>";

            submissions.forEach(submission => {
                const submissionDiv = document.createElement("div");
                submissionDiv.classList.add("submission-item");

                // Handle missing task description gracefully
                const taskName = submission.taskId && submission.taskId.description ? submission.taskId.description : "Unknown Task";

                // Ensure date formatting is correct
                const submissionDate = submission.submittedAt ? formatDate(submission.submittedAt) : "Date not available";

                const statusClass = submission.status ? submission.status.toLowerCase() : "unknown";
                const fileLink = submission.fileUrl
                    ? `<a href="${submission.fileUrl}" target="_blank">View Submission</a>`
                    : "No file uploaded";

                submissionDiv.innerHTML = `
                    <p><strong>Task Description:</strong> ${taskName}</p>
                    <p><strong>Submission Time:</strong> ${submissionDate}</p>
                    <p><strong>Status:</strong> <span class="status-${statusClass}">${submission.status || "Unknown"}</span></p>
                    <p>${fileLink}</p>
                `;

                submissionsList.appendChild(submissionDiv);
            });
        } catch (error) {
            console.error("❌ Error Fetching Submissions:", error);
            submissionsList.innerHTML = "<p>Failed to load submissions.</p>";
        }
    }


    fileUpload.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            if (!allowedFileTypes.includes(file.type)) {
                alert('Invalid file type. Please upload an image (JPG/PNG), PDF, or Word document.');
                fileUpload.value = '';
                return;
            }
            if (file.size > maxFileSize) {
                alert('File is too large. Maximum size is 5MB.');
                fileUpload.value = '';
                return;
            }

            // Preview image if it's an image file
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const previewContainer = document.querySelector('.preview-container');
                    previewContainer.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
                };
                reader.readAsDataURL(file);
            }
        }
    });

    // Add logout handler
    logoutBtn.addEventListener("click", () => {
        localStorage.clear();
        sessionStorage.clear();
        window.history.forward();
        window.location.href = "index.html";
    });

    // Fetch Tasks for User's Domain
    async function loadTasks() {
        const token = localStorage.getItem("token");
        if (!token) return alert("Unauthorized. Please log in.");

        try {
            const response = await fetch("http://localhost:5000/api/user/tasks", {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            const tasks = await response.json();

            if (tasks.error) throw new Error(tasks.error);

            taskList.innerHTML = "";
            taskSelect.innerHTML = "";

            tasks.forEach(task => {
                const taskDiv = document.createElement("div");
                taskDiv.classList.add("task");

                taskDiv.innerHTML = `
                    <h4>${task.domain}</h4>
                    <p><strong>Task:</strong> ${task.description}</p>
                    <p><strong>Deadline:</strong> ${task.deadline}</p>
                `;
                taskList.appendChild(taskDiv);

                const option = document.createElement("option");
                option.value = task._id;
                option.textContent = task.description;
                taskSelect.appendChild(option);
            });
        } catch (error) {
            console.error("❌ Error Fetching Tasks:", error);
            taskList.innerHTML = "<p>Failed to load tasks.</p>";
        }
    }

    // Handle Task Submission with progress tracking
    submissionForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const token = localStorage.getItem("token");
        if (!token) return alert("Unauthorized. Please log in.");

        const taskId = document.getElementById("taskId").value;
        const fileInput = document.getElementById("fileUpload").files[0];
        const linkInput = document.getElementById("linkInput").value;

        if (!fileInput && !linkInput) {
            alert("Please upload a file or enter a link.");
            return;
        }

        // Disable form during upload
        const submitButton = submissionForm.querySelector('button[type="submit"]');
        const loadingSpinner = submitButton.querySelector('.loading-spinner');
        submitButton.disabled = true;
        loadingSpinner.style.display = 'inline-block';
        uploadProgressContainer.style.display = 'block';
        responseMessage.style.display = 'none';

        const formData = new FormData();
        formData.append("taskId", taskId);
        if (fileInput) formData.append("file", fileInput);
        if (linkInput) formData.append("fileUrl", linkInput);
//ajax 
        try {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "http://localhost:5000/api/user/submitTask");
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);

            // Track upload progress
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    uploadProgress.style.width = percentComplete + '%';
                    uploadProgress.textContent = Math.round(percentComplete) + '%';
                }
            };

            // Handle response
            xhr.onload = function () {
                if (xhr.status === 200) {
                    const result = JSON.parse(xhr.responseText);
                    responseMessage.textContent = result.message;
                    responseMessage.className = 'status-message success';
                    loadSubmissions(); // Reload submissions after successful upload
                } else {
                    responseMessage.textContent = "Submission failed.";
                    responseMessage.className = 'status-message error';
                }
                cleanup();
            };

            // Handle errors
            xhr.onerror = function () {
                console.error("❌ Submission Error");
                responseMessage.textContent = "Submission failed.";
                responseMessage.className = 'status-message error';
                cleanup();
            };

            xhr.send(formData);
        } catch (error) {
            console.error("❌ Submission Error:", error);
            responseMessage.textContent = "Submission failed.";
            responseMessage.className = 'status-message error';
            cleanup();
        }

        function cleanup() {
            submitButton.disabled = false;
            loadingSpinner.style.display = 'none';
            uploadProgressContainer.style.display = 'none';
            responseMessage.style.display = 'block';
            uploadProgress.style.width = '0%';
            uploadProgress.textContent = '';
            submissionForm.reset();
            document.querySelector('.preview-container').innerHTML = '';
        }
    });

    // Add back button prevention
    window.addEventListener('popstate', function (event) {
        if (!checkAuth()) {
            window.location.href = "index.html";
        }
    });

    // Security checks
    setInterval(checkAuth, 5000);

    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    });

    document.addEventListener('keydown', function (e) {
        if (
            (e.altKey && e.keyCode === 37) ||
            (e.keyCode === 8 && e.target === document.body)
        ) {
            e.preventDefault();
        }
    });

    // Initial load
    loadTasks();
    loadSubmissions();
});