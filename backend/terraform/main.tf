locals {
  site_url = "https://${var.bucket_name}.website.yandexcloud.net"
}

# ---------- IAM: сервисный аккаунт + статический ключ для S3 ----------
resource "yandex_iam_service_account" "pages" {
  name        = "pages-publisher"
  description = "SA whose S3 static key is used by the YC Pages Publish Obsidian plugin"
}

resource "yandex_resourcemanager_folder_iam_member" "storage" {
  folder_id = var.folder_id
  role      = "storage.admin"
  member    = "serviceAccount:${yandex_iam_service_account.pages.id}"
}

resource "yandex_iam_service_account_static_access_key" "pages" {
  service_account_id = yandex_iam_service_account.pages.id
  description        = "S3 static key for the pages bucket (put in the plugin settings)"
}

# ---------- Публичный бакет со static hosting и TTL-lifecycle ----------
resource "yandex_storage_bucket" "pages" {
  access_key = yandex_iam_service_account_static_access_key.pages.access_key
  secret_key = yandex_iam_service_account_static_access_key.pages.secret_key
  bucket     = var.bucket_name

  anonymous_access_flags {
    read = true
    list = false
  }

  website {
    index_document = "index.html"
    error_document = "error.html"
  }

  # Подстраховка к очистке из плагина: физически удалять по TTL-префиксу.
  dynamic "lifecycle_rule" {
    for_each = { "7" = 7, "30" = 30, "90" = 90 }
    content {
      id      = "page-ttl-${lifecycle_rule.key}"
      enabled = true
      filter { prefix = "p/${lifecycle_rule.key}/" }
      expiration { days = lifecycle_rule.value }
    }
  }
  dynamic "lifecycle_rule" {
    for_each = { "7" = 7, "30" = 30, "90" = 90 }
    content {
      id      = "site-ttl-${lifecycle_rule.key}"
      enabled = true
      filter { prefix = "s/${lifecycle_rule.key}/" }
      expiration { days = lifecycle_rule.value }
    }
  }

  depends_on = [yandex_resourcemanager_folder_iam_member.storage]
}
