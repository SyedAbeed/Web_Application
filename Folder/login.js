const loginForm = document.querySelector('.form');

loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = loginForm.email.value;
    const password = loginForm.password.value;

    if (!email || !password) {
        alert('Please enter your email address and password.');
        return;
    }

    // Send the login request to the server using fetch()
    fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            email: email,
            password: password
        })
    })
        .then(response => {
            if (response.ok) {
                window.location.href = '/';
            } else {
                alert('Invalid email address or password.');
            }
        })
        .catch(error => {
            console.error(error);
            alert('An error occurred while logging in. Please try again later.');
        });







});