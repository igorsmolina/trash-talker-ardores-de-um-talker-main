// login.js
// ========
// No projeto original, o formulário de login era um <form method="post">
// de verdade, enviado para a rota Express POST /login, que renderizava a
// página de novo com uma mensagem de erro (ou redirecionava para
// /dashboard em caso de sucesso) - ver src/routes/auth-forms.ts.
//
// Como agora o frontend é HTML estático, o próprio JavaScript intercepta
// o envio do formulário, chama a API e decide o que fazer com o
// resultado.

document.addEventListener("DOMContentLoaded", function () {
  var form = document.querySelector(".auth-form");
  var errorBox = document.getElementById("login-error");
  if (!form) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = document.getElementById("email").value;
    var password = document.getElementById("password").value;
    var button = form.querySelector("button[type=submit]");
    errorBox.hidden = true;

    withLoadingState(button, "Entrando...", function () {
      return apiFetch("/api/login", {
        method: "POST",
        body: { email: email, password: password },
      });
    })
      .then(function () {
        window.location.href = "/dashboard";
      })
      .catch(function (err) {
        errorBox.textContent = err.message;
        errorBox.hidden = false;
      });
  });
});
