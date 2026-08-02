const mobileMenu=document.getElementById("mobile-navigation");
const mobileToggle=document.querySelector(".mobile-menu-toggle");
const closeMobileMenu=()=>{mobileMenu.hidden=true;mobileToggle.setAttribute("aria-expanded","false");document.body.classList.remove("mobile-menu-open")};
mobileToggle?.addEventListener("click",()=>{mobileMenu.hidden=!mobileMenu.hidden;mobileToggle.setAttribute("aria-expanded",String(!mobileMenu.hidden));document.body.classList.toggle("mobile-menu-open",!mobileMenu.hidden)});
mobileMenu?.querySelectorAll("[data-mobile-menu-close],a").forEach(el=>el.addEventListener("click",closeMobileMenu));
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&mobileMenu&&!mobileMenu.hidden)closeMobileMenu()});
