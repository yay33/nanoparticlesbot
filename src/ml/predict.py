import tensorflow as tf
import numpy as np
import json
import sys
import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
# Порядок параметров должен строго соответствовать входу модели
""" PARAM_ORDER = [
    'euConcentration',
    'phenanthrolineConcentration', 
    'ligandConcentration',
    'ligandType',
    'phBsa',
    'additionVolume',
    'additionTime',
    'additionSpeed'
    # Если в исходных данных 7 параметров, а модель ожидает 8 - нужно добавить недостающий
] """
""" 
def preprocess_input(params: list) -> np.ndarray:
    # Преобразуем массив строк в тензор для модели
    # Конвертируем строки в float и обрезаем до нужного количества параметров
    float_params = [float(p) for p in params[:len(PARAM_ORDER)]]
    
    # Проверка количества параметров
    if len(float_params) != len(PARAM_ORDER):
        raise ValueError(f"Expected {len(PARAM_ORDER)} parameters, got {len(float_params)}")
    
    # Создаём тензор формы (1, N), где N - количество фичей
    return np.array(float_params).reshape(1, -1).astype('float32') 
    """

# Новый порядок параметров после one-hot кодирования лиганда и добавления скорости
PARAM_ORDER = [
    # One-hot лиганды (4 фичи)
    'ligand_-', 
    'ligand_acid',
    'ligand_naphthyl',
    'ligand_ether',
    
    # Основные параметры
    'euConcentration',
    'phenanthrolineConcentration',
    'ligandConcentration',
    'phBsa',
    'additionVolume',
    'additionTime',
    'additionSpeed'
]

def preprocess_input(params: list) -> np.ndarray:
    """Преобразуем сырые параметры в формат модели"""
    # Исходные параметры от пользователя (7 значений):
    # [eu, phen, lig_conc, lig_type, ph, vol, time]
    
    # 1. Извлечём параметры
    eu = float(params[0])
    phen = float(params[1])
    lig_conc = float(params[2])
    lig_type = int(params[3])  # 0-3 для one-hot
    ph = float(params[4])
    vol = float(params[5])
    time = float(params[6])
    
    # 2. One-hot кодирование лиганда
    if lig_type < 0 or lig_type > 3:
        raise ValueError("Invalid ligand type (0-3)")
    ligand_onehot = [0]*4
    ligand_onehot[lig_type] = 1
    
    # 3. Рассчитаем скорость добавления
    if time == 0:
        raise ValueError("Addition time cannot be zero")
    speed = vol / time  # мл/мин
    
    # 4. Собираем все фичи в правильном порядке
    processed = [
        *ligand_onehot,    # 4 фичи
        eu,                # 1
        phen,              # 2
        lig_conc,          # 3
        ph,                # 4
        vol,               # 5
        time,              # 6
        speed              # 7 (всего 4+7=11 фичей)
    ]
    logger.info(f"Processed features: {processed}")
    return np.array(processed).reshape(1, -1).astype('float32')


def main():
    try:
        # Загрузка моделей
        size_model = tf.keras.models.load_model('F:\\Projects\\attempt1\\src\\database\\models\\size_model.keras', compile=False)
        pdi_model = tf.keras.models.load_model('F:\\Projects\\attempt1\\src\\database\\models\\pdi_model.keras', compile=False)
        
        # Ручная компиляция (если нужно)
        size_model.compile(optimizer='rmsprop', loss='mse')
        pdi_model.compile(optimizer='rmsprop', loss='mse')
        
        # Логирование входных данных
        logger.info(f"Raw input: {sys.argv[1]}")
        input_params = json.loads(sys.argv[1])
        
        # Преобразование параметров
        X = preprocess_input(input_params)
        logger.info(f"Processed shape: {X.shape}, dtype: {X.dtype}")
        
        # Предсказания
        size = size_model.predict(X, verbose=0).flatten()[0]
        pdi = pdi_model.predict(X, verbose=0).flatten()[0]
        
        # Постобработка
        result = {
            "size": round(float(size), 2),
            "pdi": round(float(pdi), 4),
            "sizeConfidence": '-',
            "pdiConfidence": '-'
        }
        
        print(json.dumps(result))
        
    except Exception as e:
        logger.exception("Critical error:")  # Детальный traceback
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
