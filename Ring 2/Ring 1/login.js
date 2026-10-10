document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if(document.getElementById('user').value === 'Ring 1' && document.getElementById('pass').value === '123') {
        window.location.href = 'categorias.html';
    } else { alert('Error: Ring 1 / 123'); }
});