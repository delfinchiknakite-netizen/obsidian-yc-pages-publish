output "site_url" {
  value       = local.site_url
  description = "Главная страница со списком"
}

output "new_page_form" {
  value       = "${local.site_url}/new.html"
  description = "Форма создания страницы"
}

output "api_url" {
  value       = local.api_url
  description = "Эндпоинт создания (POST)"
}

output "service_account_id" {
  value = yandex_iam_service_account.pages.id
}
