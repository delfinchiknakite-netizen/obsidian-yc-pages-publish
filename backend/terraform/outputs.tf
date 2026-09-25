output "s3_endpoint" {
  value       = "https://storage.yandexcloud.net"
  description = "Endpoint для настроек плагина"
}

output "s3_bucket" {
  value = yandex_storage_bucket.pages.bucket
}

output "s3_public_base_url" {
  value       = local.site_url
  description = "Публичный URL сайта (static hosting)"
}

output "s3_access_key_id" {
  value       = yandex_iam_service_account_static_access_key.pages.access_key
  description = "Access Key ID для настроек плагина"
}

output "s3_secret_access_key" {
  value       = yandex_iam_service_account_static_access_key.pages.secret_key
  sensitive   = true
  description = "Secret Access Key (terraform output -raw s3_secret_access_key)"
}
