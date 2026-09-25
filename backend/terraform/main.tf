locals {
  site_url = "https://${var.bucket_name}.website.yandexcloud.net"
  api_url  = "https://${yandex_api_gateway.pages.domain}/pages"
}

# ---------- IAM ----------
resource "yandex_iam_service_account" "pages" {
  name        = "pages-fn"
  description = "SA for the TTL-pages service (Object Storage + function)"
}

resource "yandex_resourcemanager_folder_iam_member" "storage" {
  folder_id = var.folder_id
  role      = "storage.admin"
  member    = "serviceAccount:${yandex_iam_service_account.pages.id}"
}

resource "yandex_resourcemanager_folder_iam_member" "invoker" {
  folder_id = var.folder_id
  role      = "functions.functionInvoker"
  member    = "serviceAccount:${yandex_iam_service_account.pages.id}"
}

resource "yandex_iam_service_account_static_access_key" "pages" {
  service_account_id = yandex_iam_service_account.pages.id
  description        = "S3 static key for the pages bucket"
}

# ---------- Object Storage ----------
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

  # GC по префиксу-TTL — крон не нужен
  lifecycle_rule {
    id      = "ttl7"
    enabled = true
    filter {
      prefix = "p/7/"
    }
    expiration {
      days = 7
    }
  }
  lifecycle_rule {
    id      = "ttl30"
    enabled = true
    filter {
      prefix = "p/30/"
    }
    expiration {
      days = 30
    }
  }
  lifecycle_rule {
    id      = "ttl90"
    enabled = true
    filter {
      prefix = "p/90/"
    }
    expiration {
      days = 90
    }
  }

  # многостраничные сайты из папок (тот же TTL-механизм)
  lifecycle_rule {
    id      = "site7"
    enabled = true
    filter {
      prefix = "s/7/"
    }
    expiration {
      days = 7
    }
  }
  lifecycle_rule {
    id      = "site30"
    enabled = true
    filter {
      prefix = "s/30/"
    }
    expiration {
      days = 30
    }
  }
  lifecycle_rule {
    id      = "site90"
    enabled = true
    filter {
      prefix = "s/90/"
    }
    expiration {
      days = 90
    }
  }

  depends_on = [yandex_resourcemanager_folder_iam_member.storage]
}

# ---------- Cloud Function (рендер MD->HTML) ----------
data "archive_file" "fn" {
  type        = "zip"
  source_dir  = "${path.module}/../function"
  output_path = "${path.module}/function.zip"
}

resource "yandex_function" "create" {
  name               = "pages-create"
  user_hash          = data.archive_file.fn.output_base64sha256
  runtime            = "nodejs18"
  entrypoint         = "index.handler"
  memory             = 128
  execution_timeout  = "30"
  service_account_id = yandex_iam_service_account.pages.id

  environment = {
    BUCKET                = yandex_storage_bucket.pages.bucket
    CREATE_TOKEN          = var.create_token
    SITE_URL              = local.site_url
    AWS_ACCESS_KEY_ID     = yandex_iam_service_account_static_access_key.pages.access_key
    AWS_SECRET_ACCESS_KEY = yandex_iam_service_account_static_access_key.pages.secret_key
  }

  content {
    zip_filename = data.archive_file.fn.output_path
  }
}

# ---------- API Gateway ----------
resource "yandex_api_gateway" "pages" {
  name = "pages-api"
  spec = templatefile("${path.module}/../api-gateway.yaml.tftpl", {
    function_id        = yandex_function.create.id
    service_account_id = yandex_iam_service_account.pages.id
  })
}

# ---------- Статические файлы ----------
resource "yandex_storage_object" "index" {
  access_key   = yandex_iam_service_account_static_access_key.pages.access_key
  secret_key   = yandex_iam_service_account_static_access_key.pages.secret_key
  bucket       = yandex_storage_bucket.pages.bucket
  key          = "index.html"
  source       = "${path.module}/../web/index.html"
  content_type = "text/html; charset=utf-8"
}

resource "yandex_storage_object" "error" {
  access_key   = yandex_iam_service_account_static_access_key.pages.access_key
  secret_key   = yandex_iam_service_account_static_access_key.pages.secret_key
  bucket       = yandex_storage_bucket.pages.bucket
  key          = "error.html"
  source       = "${path.module}/../web/error.html"
  content_type = "text/html; charset=utf-8"
}

resource "yandex_storage_object" "new" {
  access_key   = yandex_iam_service_account_static_access_key.pages.access_key
  secret_key   = yandex_iam_service_account_static_access_key.pages.secret_key
  bucket       = yandex_storage_bucket.pages.bucket
  key          = "new.html"
  content      = templatefile("${path.module}/../web/new.html.tftpl", { api_url = local.api_url })
  content_type = "text/html; charset=utf-8"
}

# manifest создаётся один раз; дальше его правит функция — TF его НЕ трогает
resource "yandex_storage_object" "manifest" {
  access_key   = yandex_iam_service_account_static_access_key.pages.access_key
  secret_key   = yandex_iam_service_account_static_access_key.pages.secret_key
  bucket       = yandex_storage_bucket.pages.bucket
  key          = "manifest.json"
  content      = jsonencode({ pages = [] })
  content_type = "application/json"

  lifecycle {
    ignore_changes = [content]
  }
}
