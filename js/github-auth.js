"use strict";

const API_ORIGIN = "https://api.github.com";
const API_VERSION = "2022-11-28";
const state = {
  token: null,
  user: null,
  repositories: [],
  connectedRepository: null,
  repositoryConfig: null,
  abortController: null
};
const workspaceBusyReasons = new Set();

const loginView = document.querySelector("#login-view");
const dashboardView = document.querySelector("#dashboard-view");
const tokenForm = document.querySelector("#token-form");
const tokenInput = document.querySelector("#pat-input");
const toggleTokenButton = document.querySelector("#toggle-token");
const connectButton = document.querySelector("#connect-button");
const loginStatus = document.querySelector("#login-status");
const dashboardStatus = document.querySelector("#dashboard-status");
const settingsStatus = document.querySelector("#settings-status");
const repositorySelect = document.querySelector("#repository-select");
const branchSelect = document.querySelector("#branch-select");
const verifyButton = document.querySelector("#verify-button");
const permissionsCard = document.querySelector("#permissions-card");

class GitHubApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
  }
}

function showStatus(element, message, kind = "error") {
  element.textContent = message;
  element.className = `status-message ${kind}`;
  element.hidden = false;
}

function hideStatus(element) {
  element.hidden = true;
  element.textContent = "";
  element.className = "status-message";
}

function rateLimitMessage(response) {
  const retryAfter = Number(response.headers.get("Retry-After"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return `GitHub API rate limit reached. Try again in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`;
  }
  const reset = Number(response.headers.get("X-RateLimit-Reset"));
  const resetTime = Number.isFinite(reset) && reset > 0
    ? new Date(reset * 1000).toLocaleTimeString()
    : null;
  return `GitHub API rate limit reached.${resetTime ? ` Try again after ${resetTime}.` : " Wait a little and try again."}`;
}

async function githubRequest(path, options = {}) {
  const url = new URL(path, API_ORIGIN);
  if (url.origin !== API_ORIGIN) {
    throw new Error("Blocked a request outside the GitHub API.");
  }

  const headers = {
    Accept: options.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
    Authorization: `Bearer ${state.token}`,
    "X-GitHub-Api-Version": API_VERSION
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: state.abortController.signal
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("Could not reach GitHub. Check your internet connection and try again.");
  }

  if (response.status === 401) {
    const error = new GitHubApiError("GitHub rejected this token. It may be invalid, expired, or revoked; reconnect with a valid token.", 401);
    if (state.token) showLogin(error.message);
    throw error;
  }
  if (response.status === 403 || response.status === 429) {
    if (response.status === 429 || response.headers.get("X-RateLimit-Remaining") === "0") {
      throw new GitHubApiError(rateLimitMessage(response), response.status);
    }
    const errorBody = await response.json();
    const apiMessage = errorBody && typeof errorBody.message === "string" ? errorBody.message : "";
    const writeRequest = options.method === "PUT" || options.method === "DELETE";
    if (writeRequest && /resource not accessible by personal access token/i.test(apiMessage)) {
      const repository = state.repositoryConfig ? state.repositoryConfig.fullName : "the selected repository";
      throw new GitHubApiError(
        `GitHub blocked this file write: ${apiMessage}. PAT validation and account push access do not grant token write access. Update the Fine-grained PAT to include ${repository} with Contents: Read and write. If that is already set, check organization approval, SSO, and branch rules, then reconnect with the updated token. No file was written by this request.`,
        403
      );
    }
    throw new GitHubApiError(
      `GitHub denied this request. Check selected repository access, Contents permission, organization approval, and SSO.${apiMessage ? ` GitHub says: ${apiMessage}` : ""}`,
      403
    );
  }
  if (response.status === 404) {
    throw new GitHubApiError("GitHub could not find this resource. The repository may be unavailable to this token or may not have a default branch.", 404);
  }
  if (!response.ok) {
    if (response.status === 409) {
      throw new GitHubApiError("GitHub reported a conflict. The file may have changed; reload it before retrying.", 409);
    }
    if (response.status === 422) {
      throw new GitHubApiError("GitHub could not accept this change. Check the path, file content, and permissions.", 422);
    }
    throw new GitHubApiError(`GitHub API request failed with status ${response.status}. Please try again.`, response.status);
  }
  if (options.raw) return response.blob();
  return response.status === 204 ? null : response.json();
}

async function loadRepositories() {
  const repositories = [];
  let pageNumber = 1;
  while (true) {
    const page = await githubRequest(`/user/repos?per_page=100&page=${pageNumber}&sort=updated&direction=desc`);
    repositories.push(...page);
    if (page.length < 100) break;
    pageNumber += 1;
  }
  return repositories;
}

function renderRepositories(repositories) {
  repositorySelect.replaceChildren();
  if (!repositories.length) {
    repositorySelect.add(new Option("No accessible repositories found", ""));
    repositorySelect.disabled = true;
    verifyButton.disabled = true;
    showStatus(dashboardStatus, "No repositories were returned for this token. Confirm that repository access is limited to the intended repositories and Metadata: read-only is enabled.", "info");
    return;
  }

  repositorySelect.add(new Option("Select a repository…", ""));
  repositories.forEach(repository => {
    repositorySelect.add(new Option(`${repository.full_name}${repository.private ? " · Private" : ""}`, String(repository.id)));
  });
  repositorySelect.disabled = false;
  verifyButton.disabled = true;
}

function setUserDetails(user) {
  document.querySelector("#user-login").textContent = `@${user.login}`;
  const avatar = document.querySelector("#user-avatar");
  let avatarUrl;
  try {
    avatarUrl = new URL(user.avatar_url);
  } catch (error) {
    avatarUrl = null;
  }
  if (avatarUrl && avatarUrl.protocol === "https:" && avatarUrl.hostname === "avatars.githubusercontent.com") {
    avatar.src = avatarUrl.href;
    avatar.alt = `GitHub avatar for ${user.login}`;
    avatar.hidden = false;
  } else {
    avatar.removeAttribute("src");
    avatar.alt = "";
    avatar.hidden = true;
  }
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  document.querySelector("#connection-status").textContent = "Connected · this tab only";
  document.querySelector(".auth-shell").classList.add("workspace-shell");
  document.dispatchEvent(new CustomEvent("github:connected"));
}

function showLogin(message) {
  if (state.abortController) state.abortController.abort();
  state.abortController = null;
  state.token = null;
  state.user = null;
  state.repositories = [];
  state.connectedRepository = null;
  state.repositoryConfig = null;
  workspaceBusyReasons.clear();
  document.querySelector("#connection-status").textContent = "";
  tokenInput.value = "";
  document.querySelector("#user-login").textContent = "";
  const avatar = document.querySelector("#user-avatar");
  avatar.removeAttribute("src");
  avatar.alt = "";
  avatar.hidden = true;
  repositorySelect.replaceChildren(new Option("Connect GitHub to load repositories", ""));
  repositorySelect.disabled = true;
  branchSelect.replaceChildren(new Option("Connect GitHub to load branches", ""));
  branchSelect.disabled = true;
  document.querySelector("#confirm-write-permission").checked = false;
  applyWorkspaceBusyState();
  verifyButton.disabled = true;
  permissionsCard.hidden = true;
  hideStatus(dashboardStatus);
  hideStatus(settingsStatus);
  dashboardView.hidden = true;
  loginView.hidden = false;
  document.querySelector(".auth-shell").classList.remove("workspace-shell");
  hideStatus(loginStatus);
  if (message) showStatus(loginStatus, message, "info");
  document.dispatchEvent(new CustomEvent("github:disconnected"));
}

function applyWorkspaceBusyState() {
  const busy = workspaceBusyReasons.size > 0;
  repositorySelect.disabled = busy || !state.repositories.length;
  branchSelect.disabled = busy || !branchSelect.value;
  document.querySelector("#root-folder").disabled = busy;
  document.querySelector("#confirm-write-permission").disabled = busy;
  verifyButton.disabled = busy || !state.repositories.length || !branchSelect.value;
}

function setWorkspaceBusyReason(reason, busy) {
  if (busy) workspaceBusyReasons.add(reason);
  else workspaceBusyReasons.delete(reason);
  applyWorkspaceBusyState();
}

window.MaisonMoraGitHub = Object.freeze({
  request: githubRequest,
  isConnected: () => Boolean(state.token),
  getRepositories: () => [...state.repositories],
  getConfiguration: () => state.repositoryConfig ? {...state.repositoryConfig} : null,
  clearConfiguration: () => invalidateConfiguration()
});

document.addEventListener("github:workspace-busy", event => {
  const detail = event.detail || {};
  setWorkspaceBusyReason(detail.reason || "catalog", detail.busy === true);
});

function selectedRepository() {
  return state.repositories.find(repository => String(repository.id) === repositorySelect.value);
}

function invalidateConfiguration() {
  state.connectedRepository = null;
  state.repositoryConfig = null;
  document.querySelector("#connection-status").textContent = state.token ? "Connected · this tab only" : "";
  permissionsCard.hidden = true;
  hideStatus(settingsStatus);
  document.dispatchEvent(new CustomEvent("github:configuration-cleared"));
}

async function verifyRepository() {
  const selected = selectedRepository();
  const branchName = branchSelect.value;
  const root = document.querySelector("#root-folder").value.trim();
  if (!selected || !branchName) {
    showStatus(settingsStatus, "Choose a repository and branch before verifying access.");
    return;
  }
  if (!document.querySelector("#confirm-write-permission").checked) {
    showStatus(settingsStatus, "Confirm that your Fine-grained PAT grants Contents: Read and write for this repository.");
    return;
  }
  if (!root || root.split("/").some(part => !/^[A-Za-z0-9._-]+$/.test(part) || part === "." || part === "..")) {
    showStatus(settingsStatus, "Enter a destination folder using letters, numbers, dots, hyphens, underscores, and slashes. Dot segments are not allowed.");
    return;
  }

  verifyButton.disabled = true;
  verifyButton.textContent = "Checking…";
  setWorkspaceBusyReason("verification", true);
  hideStatus(settingsStatus);
  permissionsCard.hidden = true;

  try {
    const [owner, name] = selected.full_name.split("/");
    const basePath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    const repository = await githubRequest(basePath);
    if (repository.permissions && repository.permissions.push === false) {
      throw new GitHubApiError("This GitHub account does not have push access to the selected repository.", 403);
    }
    const branch = await githubRequest(`${basePath}/branches/${encodeURIComponent(branchName)}`);
    const treeSha = branch.commit && branch.commit.commit && branch.commit.commit.tree && branch.commit.commit.tree.sha;
    if (!treeSha) {
      throw new Error("GitHub did not return a tree for the selected branch.");
    }
    await githubRequest(`${basePath}/git/trees/${encodeURIComponent(treeSha)}`);
    if (selectedRepository() !== selected || branchSelect.value !== branchName || document.querySelector("#root-folder").value.trim() !== root) {
      throw new Error("Repository settings changed during verification. Try again.");
    }

    document.querySelector("#connected-repository").textContent = repository.full_name;
    document.querySelector("#repo-status").textContent = "Verified";
    document.querySelector("#contents-read-status").textContent = "Verified — selected branch contents can be read.";
    document.querySelector("#push-status").textContent = repository.permissions && repository.permissions.push === true
      ? "Push access is reported for this GitHub account."
      : repository.permissions && repository.permissions.push === false
        ? "GitHub does not report push access for this account."
        : "GitHub did not report this permission.";
    document.querySelector("#token-write-status").textContent = "Acknowledged by you; GitHub does not expose a safe write-scope probe.";
    state.connectedRepository = repository;
    state.repositoryConfig = {
      owner,
      name,
      fullName: repository.full_name,
      branch: branchName,
      root
    };
    document.querySelector("#connection-status").textContent = `Connected · ${repository.full_name} (${branchName})`;
    permissionsCard.hidden = false;
    showStatus(settingsStatus, `${repository.full_name} on ${branchName} is ready.`, "success");
    document.dispatchEvent(new CustomEvent("github:configured", {detail: state.repositoryConfig}));
  } catch (error) {
    if (error.name === "AbortError") return;
    if (error instanceof GitHubApiError && error.status === 401) {
      return;
    }
    showStatus(settingsStatus, error.message || "Could not verify repository access.");
  } finally {
    verifyButton.textContent = "Verify and save repository";
    setWorkspaceBusyReason("verification", false);
  }
}

document.querySelector("#toggle-token").addEventListener("click", () => {
  const showing = tokenInput.type === "text";
  tokenInput.type = showing ? "password" : "text";
  toggleTokenButton.textContent = showing ? "Show" : "Hide";
  toggleTokenButton.setAttribute("aria-label", showing ? "Show token" : "Hide token");
  toggleTokenButton.setAttribute("aria-pressed", String(!showing));
});

tokenForm.addEventListener("submit", async event => {
  event.preventDefault();
  let submittedToken = tokenInput.value.trim();
  tokenInput.value = "";
  tokenInput.type = "password";
  toggleTokenButton.textContent = "Show";
  toggleTokenButton.setAttribute("aria-label", "Show token");
  toggleTokenButton.setAttribute("aria-pressed", "false");
  if (!submittedToken) {
    showStatus(loginStatus, "Enter your Fine-grained Personal Access Token.");
    return;
  }

  state.token = submittedToken;
  submittedToken = null;
  state.abortController = new AbortController();
  hideStatus(loginStatus);
  connectButton.disabled = true;
  connectButton.querySelector("span").textContent = "Connecting…";
  try {
    const user = await githubRequest("/user");
    const repositories = await loadRepositories();
    state.user = user;
    state.repositories = repositories;
    setUserDetails(user);
    renderRepositories(repositories);
    showDashboard();
  } catch (error) {
    if (error.name === "AbortError") return;
    showLogin(error.message || "Could not connect to GitHub. Please try again.");
  } finally {
    connectButton.disabled = false;
    connectButton.querySelector("span").textContent = "Connect GitHub";
  }
});

repositorySelect.addEventListener("change", () => {
  invalidateConfiguration();
  document.querySelector("#confirm-write-permission").checked = false;
  branchSelect.replaceChildren(new Option("Loading branches…", ""));
  branchSelect.disabled = true;
  verifyButton.disabled = true;
  document.dispatchEvent(new CustomEvent("github:repository-selected", {detail: selectedRepository() || null}));
});

branchSelect.addEventListener("change", invalidateConfiguration);
document.querySelector("#root-folder").addEventListener("input", invalidateConfiguration);
verifyButton.addEventListener("click", verifyRepository);
document.querySelector("#logout-button").addEventListener("click", () => {
  showLogin("Disconnected. The token has been cleared from this page.");
});

window.addEventListener("pagehide", () => {
  if (state.abortController) state.abortController.abort();
  state.abortController = null;
  state.token = null;
});

window.addEventListener("pageshow", event => {
  if (event.persisted) showLogin("Session ended when you left this page. Reconnect with your token.");
});
