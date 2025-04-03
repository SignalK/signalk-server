// TypeDoc's theme toggle script assumes a select element. This is a workaround to make it work with a radio button.

function initTheme() {
  const form = document.getElementById('tsd-theme-toggle')
  console.log('initTheme', form)
  if (!form) return

  const savedTheme = localStorage.getItem('tsd-theme')
  setTheme(savedTheme)

  const element = form.elements['tsd-theme']
  element.value = savedTheme
  form.addEventListener('change', () => {
    console.log('change', element.value)
    localStorage.setItem('tsd-theme', element.value)
    setTheme(element.value)
  })
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme
}

document.addEventListener('DOMContentLoaded', initTheme)
