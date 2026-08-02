const initialOrders = [
  { id: "ON-104", product: "Dune · 12 pièces", client: "Maison Rivage", date: "Aujourd’hui · 14:30", status: "En cours" },
  { id: "ON-103", product: "Écume · 8 pièces", client: "Studio Sillage", date: "Aujourd’hui · 17:00", status: "À préparer" },
  { id: "ON-102", product: "Oasis · 16 pièces", client: "Hôtel Serein", date: "Demain · 10:00", status: "À préparer" },
  { id: "ON-101", product: "Dune · 6 pièces", client: "Bureau Horizon", date: "4 août · 09:30", status: "Prête" },
];

const clients = [
  { name: "Maison Rivage", sector: "Maison d’hôtes fictive", initials: "MR", orders: "8", value: "1 460 €" },
  { name: "Studio Sillage", sector: "Studio créatif fictif", initials: "SS", orders: "5", value: "920 €" },
  { name: "Hôtel Serein", sector: "Hôtellerie fictive", initials: "HS", orders: "11", value: "2 180 €" },
];

const periods = {
  week: {
    revenue: "4 280 €",
    progress: "86%",
    active: "14",
    satisfaction: "4,8",
    summary: "28 cette semaine",
    values: [34, 56, 44, 72, 93, 64, 48],
    labels: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"],
    chartLabel: "Histogramme des commandes confirmées sur sept jours",
  },
  month: {
    revenue: "17 940 €",
    progress: "72%",
    active: "41",
    satisfaction: "4,7",
    summary: "112 sur trente jours",
    values: [54, 73, 61, 82, 68, 90, 76],
    labels: ["S1", "S2", "S3", "S4", "S5", "S6", "S7"],
    chartLabel: "Histogramme des commandes confirmées sur trente jours",
  },
};

const routes = {
  overview: "/",
  orders: "/commandes",
  clients: "/clients",
};

const routeViews = new Map(Object.entries(routes).map(([view, path]) => [path, view]));
const viewTitles = {
  overview: "Vue d’ensemble",
  orders: "Commandes",
  clients: "Clients",
};

let orders = initialOrders.map((order) => ({ ...order }));
let toastTimer;

const pageTitle = document.querySelector("#page-title");
const panels = [...document.querySelectorAll("[data-panel]")];
const navigation = [...document.querySelectorAll("[data-view]")];
const orderDialog = document.querySelector("#order-dialog");
const orderForm = document.querySelector("#order-form");
const orderFilter = document.querySelector("#order-filter");
const clientSearch = document.querySelector("#client-search");
const toast = document.querySelector("#toast");

function publishReviewContext() {
  if (window.parent === window) return;
  try {
    const parentOrigin = new URL(document.body.dataset.revaloopOrigin).origin;
    window.parent.postMessage(
      {
        type: "revaloop:context",
        path: window.location.pathname,
        title: document.title,
      },
      parentOrigin,
    );
  } catch {
    // Une configuration invalide désactive seulement le contexte de revue.
  }
}

function activateView(view, { updateHistory = true } = {}) {
  const safeView = Object.hasOwn(routes, view) ? view : "overview";
  for (const panel of panels) panel.hidden = panel.dataset.panel !== safeView;
  for (const item of navigation) {
    const current = item.dataset.view === safeView;
    item.classList.toggle("is-current", current);
    if (current) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }
  pageTitle.textContent = viewTitles[safeView];
  document.title = `${viewTitles[safeView]} · Atelier Onda — démo Revaloop`;
  if (updateHistory && window.location.pathname !== routes[safeView]) {
    window.history.pushState({ view: safeView }, "", routes[safeView]);
  }
  publishReviewContext();
  document.querySelector("#contenu").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

function statusClass(status) {
  if (status === "À préparer") return "status-pill status-warm";
  if (status === "En cours") return "status-pill status-neutral";
  return "status-pill";
}

function createCell(content, className) {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  if (content instanceof Node) cell.append(content);
  else cell.textContent = content;
  return cell;
}

function renderOrders() {
  const body = document.querySelector("#orders-body");
  const selectedStatus = orderFilter.value;
  const visibleOrders = orders.filter(
    (order) => selectedStatus === "all" || order.status === selectedStatus,
  );
  body.replaceChildren();

  for (const order of visibleOrders) {
    const row = document.createElement("tr");
    const identity = document.createElement("div");
    identity.className = "order-name";
    const id = document.createElement("strong");
    id.textContent = order.id;
    const product = document.createElement("span");
    product.textContent = order.product;
    identity.append(id, product);

    const status = document.createElement("span");
    status.className = statusClass(order.status);
    status.textContent = order.status;

    const action = document.createElement("button");
    action.className = "row-action";
    action.type = "button";
    action.dataset.orderId = order.id;
    action.textContent = order.status === "Prête" ? "Rouvrir" : "Marquer prête";
    action.setAttribute(
      "aria-label",
      `${action.textContent} pour la commande ${order.id}`,
    );

    row.append(
      createCell(identity, "order-name"),
      createCell(order.client),
      createCell(order.date),
      createCell(status),
      createCell(action),
    );
    body.append(row);
  }

  document.querySelector("#orders-empty").hidden = visibleOrders.length > 0;
  document.querySelector("#order-count").textContent = String(orders.length);
}

function renderClients(query = "") {
  const normalized = query.trim().toLocaleLowerCase("fr");
  const visibleClients = clients.filter((client) =>
    `${client.name} ${client.sector}`.toLocaleLowerCase("fr").includes(normalized),
  );
  const grid = document.querySelector("#client-grid");
  grid.replaceChildren();

  for (const client of visibleClients) {
    const card = document.createElement("article");
    card.className = "surface client-card";
    const head = document.createElement("div");
    head.className = "client-card-head";
    const monogram = document.createElement("span");
    monogram.className = "client-monogram";
    monogram.setAttribute("aria-hidden", "true");
    monogram.textContent = client.initials;
    const identity = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = client.name;
    const sector = document.createElement("p");
    sector.textContent = client.sector;
    identity.append(title, sector);
    head.append(monogram, identity);

    const details = document.createElement("dl");
    for (const [label, value] of [
      ["Commandes", client.orders],
      ["Volume fictif", client.value],
    ]) {
      const wrapper = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      wrapper.append(term, description);
      details.append(wrapper);
    }
    card.append(head, details);
    grid.append(card);
  }
  document.querySelector("#clients-empty").hidden = visibleClients.length > 0;
}

function renderPeriod(periodName) {
  const period = periods[periodName];
  document.querySelector("#revenue-value").textContent = period.revenue;
  document.querySelector("#revenue-progress").style.width = period.progress;
  document.querySelector("#active-orders-value").textContent = period.active;
  document.querySelector("#satisfaction-value").firstChild.textContent = period.satisfaction;
  document.querySelector("#chart-summary").textContent = period.summary;

  const chart = document.querySelector("#bar-chart");
  chart.setAttribute("aria-label", period.chartLabel);
  chart.replaceChildren(
    ...period.values.map((value) => {
      const bar = document.createElement("span");
      bar.className = "chart-bar";
      bar.style.height = `${value}%`;
      return bar;
    }),
  );
  const labels = document.querySelector("#chart-labels");
  labels.replaceChildren(
    ...period.labels.map((label) => {
      const item = document.createElement("span");
      item.textContent = label;
      return item;
    }),
  );
}

function openOrderDialog({ product = "" } = {}) {
  orderForm.reset();
  if (product) orderForm.elements.product.value = product;
  const date = new Date();
  date.setDate(date.getDate() + 2);
  orderForm.elements.date.value = date.toISOString().slice(0, 10);
  orderDialog.showModal();
  orderForm.elements.client.focus();
}

function applyPilotVariant() {
  if (document.body.dataset.pilotVariant !== "corrected") return;
  document.querySelector("#variant-banner").hidden = false;
  document.querySelector("#prepare-selection").textContent =
    "Préparer la livraison";
}

for (const item of navigation) {
  item.addEventListener("click", () => activateView(item.dataset.view));
}

for (const link of document.querySelectorAll("[data-view-link]")) {
  link.addEventListener("click", () => activateView(link.dataset.viewLink));
}

for (const button of document.querySelectorAll("[data-period]")) {
  button.addEventListener("click", () => {
    for (const candidate of document.querySelectorAll("[data-period]")) {
      candidate.setAttribute("aria-pressed", String(candidate === button));
    }
    renderPeriod(button.dataset.period);
  });
}

document.querySelector("#open-order").addEventListener("click", () => openOrderDialog());
document.querySelector("#prepare-selection").addEventListener("click", () =>
  openOrderDialog({ product: "Dune" }),
);
document.querySelector("#close-dialog").addEventListener("click", () => orderDialog.close());
document.querySelector("#cancel-dialog").addEventListener("click", () => orderDialog.close());

orderDialog.addEventListener("click", (event) => {
  if (event.target === orderDialog) orderDialog.close();
});

orderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!orderForm.reportValidity()) return;
  const data = new FormData(orderForm);
  const nextNumber = 105 + Math.max(0, orders.length - initialOrders.length);
  const formattedDate = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${data.get("date")}T12:00:00`));
  orders.unshift({
    id: `ON-${nextNumber}`,
    product: `${data.get("product")} · nouvelle sélection`,
    client: String(data.get("client")),
    date: formattedDate,
    status: "À préparer",
  });
  orderFilter.value = "all";
  renderOrders();
  orderDialog.close();
  activateView("orders");
  showToast("Commande fictive ajoutée. Elle disparaîtra au rechargement.");
});

document.querySelector("#orders-body").addEventListener("click", (event) => {
  const action = event.target.closest("[data-order-id]");
  if (!action) return;
  const order = orders.find((candidate) => candidate.id === action.dataset.orderId);
  if (!order) return;
  order.status = order.status === "Prête" ? "À préparer" : "Prête";
  renderOrders();
  showToast(`Le statut de ${order.id} a été modifié uniquement dans la démo.`);
});

orderFilter.addEventListener("change", renderOrders);
clientSearch.addEventListener("input", () => renderClients(clientSearch.value));

document.querySelector("#reset-demo").addEventListener("click", () => {
  orders = initialOrders.map((order) => ({ ...order }));
  orderFilter.value = "all";
  clientSearch.value = "";
  renderOrders();
  renderClients();
  renderPeriod("week");
  for (const button of document.querySelectorAll("[data-period]")) {
    button.setAttribute("aria-pressed", String(button.dataset.period === "week"));
  }
  activateView("overview");
  showToast("La démonstration a été réinitialisée.");
});

window.addEventListener("popstate", () => {
  activateView(routeViews.get(window.location.pathname) ?? "overview", {
    updateHistory: false,
  });
});
window.addEventListener("pageshow", publishReviewContext);

renderOrders();
renderClients();
renderPeriod("week");
applyPilotVariant();
activateView(routeViews.get(window.location.pathname) ?? "overview", {
  updateHistory: false,
});
