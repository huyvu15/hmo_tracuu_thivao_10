const menuToggle = document.querySelector("#menu-toggle");
const mainNav = document.querySelector("#main-nav");
const header = document.querySelector(".header-inner");

if (menuToggle && mainNav && header) {
  header.classList.add("has-collapsible-nav");

  const closeMenu = () => {
    header.classList.remove("nav-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Mở menu điều hướng");
  };

  const openMenu = () => {
    header.classList.add("nav-open");
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Đóng menu điều hướng");
  };

  menuToggle.addEventListener("click", () => {
    if (header.classList.contains("nav-open")) {
      closeMenu();
      return;
    }
    openMenu();
  });

  document.addEventListener("click", (event) => {
    if (!header.contains(event.target)) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
}
