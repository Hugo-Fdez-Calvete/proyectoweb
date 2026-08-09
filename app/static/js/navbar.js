document.addEventListener("DOMContentLoaded", () => {
    const burgers = document.querySelectorAll(".navbar-burger");
    burgers.forEach(burger => {
        burger.addEventListener("click", () => {
            const target = burger.dataset.target;
            const menu = document.getElementById(target);
            burger.classList.toggle("is-active");
            menu.classList.toggle("is-active");
            const expanded = burger.classList.contains("is-active");
            burger.setAttribute(
                "aria-expanded",
                expanded
            );
        });
    });
});