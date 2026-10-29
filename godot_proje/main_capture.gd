extends Node3D

func _ready() -> void:
	print("[Godot] Oyun baslatildi, 3D dunya ciziliyor...")
	# Sahnenin ve isiklarin render edilmesi icin 1 saniye bekle
	await get_tree().create_timer(1.0).timeout
	
	var viewport := get_viewport()
	var img := viewport.get_texture().get_image()
	
	var save_path := "res://ekran_goruntusu.png"
	var err := img.save_png(save_path)
	
	if err == OK:
		print("==========================================================")
		print("[+] EKRAN GORUNTUSU BASARIYLA ALINDI -> ekran_goruntusu.png")
		print("==========================================================")
	else:
		print("[!] Hata olustu: ", err)
	
	# Gorev bitti, oyunu kapat
	get_tree().quit(0)
