// settings.js
// ===========
// Tela de Configurações: informações da conta (email, data de criação),
// alteração de senha, exportação dos dados da conta (LGPD) e o botão
// "Excluir Conta" (o resto da página - troca de tema - já é cuidado
// por js/theme.js em toda página).

document.addEventListener("DOMContentLoaded", function () {
  wireDeleteAccountButton();
  loadAccountInfo();
  wirePasswordForm();
  wireExportDataButton();
});

function wireDeleteAccountButton() {
  var deleteBtn = document.getElementById("delete-account-btn");
  if (!deleteBtn) return;

  deleteBtn.addEventListener("click", function () {
    showConfirmModal({
      title: "Excluir conta",
      message:
        "Essa ação não pode ser desfeita e todas as suas conversas serão " +
        "apagadas. Digite sua senha para confirmar.",
      confirmText: "Excluir conta",
      confirmLoadingText: "Excluindo...",
      danger: true,
      password: true,
      onConfirm: function (password) {
        return apiFetch("/api/account/delete", {
          method: "POST",
          body: { password: password },
        }).then(function () {
          var cleanup = emitTT("account-deleted", {});
          emitTT("logout");
          window.location.href = cleanup.cleanupFailed ? "/?limpeza-local=erro" : "/";
        });
      },
    });
  });
}

// Busca própria de GET /api/dashboard (independente da que js/layout.js
// já faz para montar a sidebar) só para preencher email + data de
// criação - mesmo padrão de js/account.js, que também busca seus
// próprios dados em vez de tentar coordenar com layout.js.
async function loadAccountInfo() {
  var emailEl = document.getElementById("account-info-email");
  var createdAtEl = document.getElementById("account-info-created-at");
  if (!emailEl || !createdAtEl) return;

  var data;
  try {
    data = await apiFetch("/api/dashboard");
  } catch (_err) {
    // Sessão inválida: js/layout.js (carregado nesta mesma página) já
    // cuida do redirecionamento para /login.
    return;
  }

  emailEl.textContent = data.user.email;
  createdAtEl.textContent = data.user.created_at
    ? new Date(data.user.created_at).toLocaleDateString("pt-BR")
    : "—";
}

function wirePasswordForm() {
  var form = document.getElementById("password-form");
  if (!form) return;

  var newInput = document.getElementById("new-password");
  var confirmInput = document.getElementById("confirm-new-password");
  var errorBanner = document.getElementById("password-error");
  var successBanner = document.getElementById("password-success");

  // wirePasswordRequirements/passwordRequirementsErrorMessage vêm de
  // js/auth.js (carregado antes deste script - ver settings.html) e são
  // a mesma checklist usada no cadastro e na redefinição de senha.
  wirePasswordRequirements(
    newInput,
    document.getElementById("new-password-requirements"),
  );

  // Mesma ideia de js/auth.js (wirePasswordConfirmValidation), só que
  // inline: aquela função é fixa nos ids "password"/"confirm-password"
  // das páginas públicas de auth, e generalizá-la não valeria a pena
  // por essas poucas linhas de lógica duplicada.
  confirmInput.addEventListener("input", function () {
    confirmInput.setCustomValidity(
      newInput.value !== confirmInput.value ? "As senhas não coincidem" : "",
    );
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errorBanner.hidden = true;
    successBanner.hidden = true;
    var submitBtn = form.querySelector("button[type=submit]");

    var passwordError = passwordRequirementsErrorMessage(newInput.value);
    if (passwordError) {
      errorBanner.textContent = passwordError;
      errorBanner.hidden = false;
      return;
    }

    withLoadingState(submitBtn, "Salvando...", function () {
      return apiFetch("/api/account/password", {
        method: "POST",
        body: {
          currentPassword: document.getElementById("current-password").value,
          newPassword: newInput.value,
        },
      });
    })
      .then(function () {
        form.reset();
        successBanner.hidden = false;
      })
      .catch(function (err) {
        errorBanner.textContent = err.message;
        errorBanner.hidden = false;
      });
  });
}

// Busca o JSON de exportação via apiFetch (mesmo tratamento de
// erro/loading-state do resto do app) e dispara o download na mão:
// Blob + link temporário com atributo download. Primeiro download de
// arquivo do app - não existia nenhum padrão pra reaproveitar.
function wireExportDataButton() {
  var exportBtn = document.getElementById("export-data-btn");
  if (!exportBtn) return;

  exportBtn.addEventListener("click", function () {
    withLoadingState(exportBtn, "Exportando...", function () {
      return apiFetch("/api/dashboard").then(function (identity) {
        emitTT("user", identity.user);
        return apiFetch("/api/account/export").then(function (data) {
          // Export uses "profile", not "user"; do not alter or invent an API field.
          if (window.Socializacao && data.profile && data.profile.email === identity.user.email) {
            data = Object.assign({}, data, { socializacaoLocal: Socializacao.exportLocal(identity.user.id) });
          }
          return data;
        });
      });
    })
      .then(function (data) {
        var blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = "trash-talker-dados.json";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      })
      .catch(function (err) {
        showUIMessage(err.message, document.getElementById("export-data-btn").closest(".card"));
      });
  });
}
