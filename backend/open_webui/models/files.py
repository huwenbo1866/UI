import logging
import time
import uuid
from typing import Optional, List

from sqlalchemy.orm import Session
from open_webui.internal.db import Base, JSONField, engine, get_db, get_db_context
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import BigInteger, Column, Integer, String, Text, JSON, ForeignKey

log = logging.getLogger(__name__)

####################
# Files DB Schema
####################


class File(Base):
    __tablename__ = "file"
    id = Column(String, primary_key=True, unique=True)
    user_id = Column(String)
    hash = Column(Text, nullable=True)

    filename = Column(Text)
    path = Column(Text, nullable=True)

    data = Column(JSON, nullable=True)
    meta = Column(JSON, nullable=True)

    access_control = Column(JSON, nullable=True)

    created_at = Column(BigInteger)
    updated_at = Column(BigInteger)


class FileModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    hash: Optional[str] = None

    filename: str
    path: Optional[str] = None

    data: Optional[dict] = None
    meta: Optional[dict] = None

    access_control: Optional[dict] = None

    created_at: Optional[int]  # timestamp in epoch
    updated_at: Optional[int]  # timestamp in epoch


####################
# Forms
####################


class FileMeta(BaseModel):
    name: Optional[str] = None
    content_type: Optional[str] = None
    size: Optional[int] = None

    model_config = ConfigDict(extra="allow")

    @model_validator(mode="before")
    @classmethod
    def sanitize_meta(cls, data):
        """Sanitize metadata fields to handle malformed legacy data."""
        if not isinstance(data, dict):
            return data
        
        # Handle content_type that may be a list like ['application/pdf', None]
        content_type = data.get("content_type")
        if isinstance(content_type, list):
            # Extract first non-None string value
            data["content_type"] = next(
                (item for item in content_type if isinstance(item, str)), None
            )
        elif content_type is not None and not isinstance(content_type, str):
            data["content_type"] = None
        
        return data


class FileModelResponse(BaseModel):
    id: str
    user_id: str
    hash: Optional[str] = None

    filename: str
    data: Optional[dict] = None
    meta: FileMeta

    created_at: int  # timestamp in epoch
    updated_at: Optional[int] = None  # timestamp in epoch, optional for legacy files

    model_config = ConfigDict(extra="allow")


class FileMetadataResponse(BaseModel):
    id: str
    hash: Optional[str] = None
    meta: Optional[dict] = None
    created_at: int  # timestamp in epoch
    updated_at: int  # timestamp in epoch


class FileForm(BaseModel):
    id: str
    hash: Optional[str] = None
    filename: str
    path: str
    data: dict = {}
    meta: dict = {}
    access_control: Optional[dict] = None


class FileUpdateForm(BaseModel):
    hash: Optional[str] = None
    data: Optional[dict] = None
    meta: Optional[dict] = None


class FileListResponse(BaseModel):
    items: list[FileModel]
    total: int


class FilesTable:
    def insert_new_file(
        self, user_id: str, form_data: FileForm, db: Optional[Session] = None
    ) -> Optional[FileModel]:
        with get_db_context(db) as db:
            file = FileModel(
                **{
                    **form_data.model_dump(),
                    "user_id": user_id,
                    "created_at": int(time.time()),
                    "updated_at": int(time.time()),
                }
            )

            try:
                result = File(**file.model_dump())
                db.add(result)
                db.commit()
                db.refresh(result)
                if result:
                    return FileModel.model_validate(result)
                else:
                    return None
            except Exception as e:
                log.exception(f"Error inserting a new file: {e}")
                return None

    def get_file_by_id(
        self, id: str, db: Optional[Session] = None
    ) -> Optional[FileModel]:
        try:
            with get_db_context(db) as db:
                try:
                    file = db.get(File, id)
                    return FileModel.model_validate(file)
                except Exception:
                    return None
        except Exception:
            return None

    def get_file_by_id_and_user_id(
        self, id: str, user_id: str, db: Optional[Session] = None
    ) -> Optional[FileModel]:
        with get_db_context(db) as db:
            try:
                file = db.query(File).filter_by(id=id, user_id=user_id).first()
                if file:
                    return FileModel.model_validate(file)
                else:
                    return None
            except Exception:
                return None

    def get_file_metadata_by_id(
        self, id: str, db: Optional[Session] = None
    ) -> Optional[FileMetadataResponse]:
        with get_db_context(db) as db:
            try:
                file = db.get(File, id)
                return FileMetadataResponse(
                    id=file.id,
                    hash=file.hash,
                    meta=file.meta,
                    created_at=file.created_at,
                    updated_at=file.updated_at,
                )
            except Exception:
                return None

    def get_files(self, db: Optional[Session] = None) -> list[FileModel]:
        with get_db_context(db) as db:
            return [FileModel.model_validate(file) for file in db.query(File).all()]

    def check_access_by_user_id(
        self, id, user_id, permission="write", db: Optional[Session] = None
    ) -> bool:
        file = self.get_file_by_id(id, db=db)
        if not file:
            return False
        if file.user_id == user_id:
            return True
        # Implement additional access control logic here as needed
        return False

    def get_files_by_ids(
        self, ids: list[str], db: Optional[Session] = None
    ) -> list[FileModel]:
        with get_db_context(db) as db:
            return [
                FileModel.model_validate(file)
                for file in db.query(File)
                .filter(File.id.in_(ids))
                .order_by(File.updated_at.desc())
                .all()
            ]

    def get_file_metadatas_by_ids(
        self, ids: list[str], db: Optional[Session] = None
    ) -> list[FileMetadataResponse]:
        with get_db_context(db) as db:
            return [
                FileMetadataResponse(
                    id=file.id,
                    hash=file.hash,
                    meta=file.meta,
                    created_at=file.created_at,
                    updated_at=file.updated_at,
                )
                for file in db.query(
                    File.id, File.hash, File.meta, File.created_at, File.updated_at
                )
                .filter(File.id.in_(ids))
                .order_by(File.updated_at.desc())
                .all()
            ]

    def get_files_by_user_id(
        self, user_id: str, db: Optional[Session] = None
    ) -> list[FileModel]:
        with get_db_context(db) as db:
            return [
                FileModel.model_validate(file)
                for file in db.query(File).filter_by(user_id=user_id).all()
            ]

    @staticmethod
    def _glob_to_like_pattern(glob: str) -> str:
        """
        Convert a glob/fnmatch pattern to a SQL LIKE pattern.

        Escapes SQL special characters and converts glob wildcards:
        - `*` becomes `%` (match any sequence of characters)
        - `?` becomes `_` (match exactly one character)

        Args:
            glob: A glob pattern (e.g., "*.txt", "file?.doc")

        Returns:
            A SQL LIKE compatible pattern with proper escaping.
        """
        # Escape SQL special characters first, then convert glob wildcards
        pattern = glob.replace("\\", "\\\\")
        pattern = pattern.replace("%", "\\%")
        pattern = pattern.replace("_", "\\_")
        pattern = pattern.replace("*", "%")
        pattern = pattern.replace("?", "_")
        return pattern

    def search_files(
        self,
        user_id: Optional[str] = None,
        filename: str = "*",
        skip: int = 0,
        limit: int = 100,
        db: Optional[Session] = None,
    ) -> list[FileModel]:
        """
        Search files with glob pattern matching, optional user filter, and pagination.

        Args:
            user_id: Filter by user ID. If None, returns files for all users.
            filename: Glob pattern to match filenames (e.g., "*.txt"). Default "*" matches all.
            skip: Number of results to skip for pagination.
            limit: Maximum number of results to return.
            db: Optional database session.

        Returns:
            List of matching FileModel objects, ordered by updated_at descending.
        """
        with get_db_context(db) as db:
            query = db.query(File)

            if user_id:
                query = query.filter_by(user_id=user_id)

            pattern = self._glob_to_like_pattern(filename)
            if pattern != "%":
                query = query.filter(File.filename.ilike(pattern, escape="\\"))

            return [
                FileModel.model_validate(file)
                for file in query.order_by(File.updated_at.desc())
                .offset(skip)
                .limit(limit)
                .all()
            ]

    def update_file_by_id(
        self, id: str, form_data: FileUpdateForm, db: Optional[Session] = None
    ) -> Optional[FileModel]:
        with get_db_context(db) as db:
            try:
                file = db.query(File).filter_by(id=id).first()

                if form_data.hash is not None:
                    file.hash = form_data.hash

                if form_data.data is not None:
                    file.data = {**(file.data if file.data else {}), **form_data.data}

                if form_data.meta is not None:
                    file.meta = {**(file.meta if file.meta else {}), **form_data.meta}

                file.updated_at = int(time.time())
                db.commit()
                return FileModel.model_validate(file)
            except Exception as e:
                log.exception(f"Error updating file completely by id: {e}")
                return None

    def update_file_hash_by_id(
        self, id: str, hash: Optional[str], db: Optional[Session] = None
    ) -> Optional[FileModel]:
        with get_db_context(db) as db:
            try:
                file = db.query(File).filter_by(id=id).first()
                file.hash = hash
                file.updated_at = int(time.time())
                db.commit()

                return FileModel.model_validate(file)
            except Exception:
                return None

    def update_file_data_by_id(
        self, id: str, data: dict, db: Optional[Session] = None
    ) -> Optional[FileModel]:
        with get_db_context(db) as db:
            try:
                file = db.query(File).filter_by(id=id).first()
                file.data = {**(file.data if file.data else {}), **data}
                file.updated_at = int(time.time())
                db.commit()
                return FileModel.model_validate(file)
            except Exception as e:

                return None

    def update_file_metadata_by_id(
        self, id: str, meta: dict, db: Optional[Session] = None
    ) -> Optional[FileModel]:
        with get_db_context(db) as db:
            try:
                file = db.query(File).filter_by(id=id).first()
                file.meta = {**(file.meta if file.meta else {}), **meta}
                file.updated_at = int(time.time())
                db.commit()
                return FileModel.model_validate(file)
            except Exception:
                return None

                return False

    def delete_file_by_id(self, id: str, db: Optional[Session] = None) -> bool:
        with get_db_context(db) as db:
            try:
                db.query(File).filter_by(id=id).delete()
                db.commit()

                return True
            except Exception:
                return False

    def delete_all_files(self, db: Optional[Session] = None) -> bool:
        with get_db_context(db) as db:
            try:
                db.query(File).delete()
                db.commit()

                return True
            except Exception:
                return False


Files = FilesTable()


####################
# FileChapter DB Schema (PDF 一级章节)
####################


class FileChapter(Base):
    __tablename__ = "file_chapter"
    id = Column(String, primary_key=True)
    file_id = Column(String, ForeignKey("file.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(Text, nullable=False)
    start_page = Column(Integer, nullable=False)  # 0-indexed
    end_page = Column(Integer, nullable=False)    # 0-indexed, inclusive
    created_at = Column(BigInteger)


class FileChapterModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_id: str
    title: str
    start_page: int
    end_page: int
    created_at: Optional[int] = None


class FileChaptersTable:
    def insert_chapters(
        self, file_id: str, chapters: List[dict], db: Optional[Session] = None
    ) -> List[FileChapterModel]:
        """批量插入章节，先清除旧数据。"""
        with get_db_context(db) as db:
            try:
                # 先删除旧章节
                db.query(FileChapter).filter_by(file_id=file_id).delete()
                db.flush()

                now = int(time.time())
                results = []
                for ch in chapters:
                    record = FileChapter(
                        id=str(uuid.uuid4()),
                        file_id=file_id,
                        title=ch["title"],
                        start_page=ch["start_page"],
                        end_page=ch["end_page"],
                        created_at=now,
                    )
                    db.add(record)
                    results.append(record)

                db.commit()
                return [FileChapterModel.model_validate(r) for r in results]
            except Exception as e:
                log.exception(f"Error inserting chapters for file {file_id}: {e}")
                db.rollback()
                return []

    def get_chapters_by_file_id(
        self, file_id: str, db: Optional[Session] = None
    ) -> List[FileChapterModel]:
        with get_db_context(db) as db:
            try:
                rows = (
                    db.query(FileChapter)
                    .filter_by(file_id=file_id)
                    .order_by(FileChapter.start_page.asc())
                    .all()
                )
                return [FileChapterModel.model_validate(r) for r in rows]
            except Exception:
                return []

    def delete_chapters_by_file_id(
        self, file_id: str, db: Optional[Session] = None
    ) -> bool:
        with get_db_context(db) as db:
            try:
                db.query(FileChapter).filter_by(file_id=file_id).delete()
                db.commit()
                return True
            except Exception:
                return False


FileChapters = FileChaptersTable()


####################
# FileSection DB Schema (txt/docx 段落分段)
####################


class FileSection(Base):
    __tablename__ = "file_section"
    id = Column(String, primary_key=True)
    file_id = Column(String, ForeignKey("file.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    order_index = Column(Integer, nullable=False)
    created_at = Column(BigInteger)


class FileSectionModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_id: str
    title: str
    content: str
    order_index: int
    created_at: Optional[int] = None


class FileSectionsTable:
    def insert_sections(
        self, file_id: str, sections: List[dict], db: Optional[Session] = None
    ) -> List[FileSectionModel]:
        """批量插入段落，先清除旧数据。"""
        with get_db_context(db) as db:
            try:
                db.query(FileSection).filter_by(file_id=file_id).delete()
                db.flush()

                now = int(time.time())
                results = []
                for sec in sections:
                    record = FileSection(
                        id=str(uuid.uuid4()),
                        file_id=file_id,
                        title=sec["title"],
                        content=sec["content"],
                        order_index=sec["order_index"],
                        created_at=now,
                    )
                    db.add(record)
                    results.append(record)

                db.commit()
                return [FileSectionModel.model_validate(r) for r in results]
            except Exception as e:
                log.exception(f"Error inserting sections for file {file_id}: {e}")
                db.rollback()
                return []

    def get_sections_by_file_id(
        self, file_id: str, db: Optional[Session] = None
    ) -> List[FileSectionModel]:
        with get_db_context(db) as db:
            try:
                rows = (
                    db.query(FileSection)
                    .filter_by(file_id=file_id)
                    .order_by(FileSection.order_index.asc())
                    .all()
                )
                return [FileSectionModel.model_validate(r) for r in rows]
            except Exception:
                return []

    def get_section_by_id(
        self, section_id: str, db: Optional[Session] = None
    ) -> Optional[FileSectionModel]:
        with get_db_context(db) as db:
            try:
                row = db.get(FileSection, section_id)
                if row:
                    return FileSectionModel.model_validate(row)
                return None
            except Exception:
                return None

    def delete_sections_by_file_id(
        self, file_id: str, db: Optional[Session] = None
    ) -> bool:
        with get_db_context(db) as db:
            try:
                db.query(FileSection).filter_by(file_id=file_id).delete()
                db.commit()
                return True
            except Exception:
                return False


FileSections = FileSectionsTable()


####################
# FileChapterMindmap DB Schema (PDF 章节思维导图)
####################


class FileChapterMindmap(Base):
    __tablename__ = "file_chapter_mindmap"

    id = Column(String, primary_key=True)
    file_id = Column(String, ForeignKey("file.id", ondelete="CASCADE"), nullable=False, index=True)
    chapter_title = Column(Text, nullable=False)
    chapter_start_page = Column(Integer, nullable=False)
    chapter_end_page = Column(Integer, nullable=False)
    subject = Column(String, nullable=True)
    tree_data = Column(JSON, nullable=False)
    markmap_markdown = Column(Text, nullable=False)
    created_at = Column(BigInteger)
    updated_at = Column(BigInteger)


class FileChapterMindmapModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_id: str
    chapter_title: str
    chapter_start_page: int
    chapter_end_page: int
    subject: Optional[str] = None
    tree_data: dict = Field(default_factory=dict)
    markmap_markdown: str
    created_at: Optional[int] = None
    updated_at: Optional[int] = None


class FileChapterMindmapCreateForm(BaseModel):
    chapter_title: str
    chapter_start_page: int
    chapter_end_page: int
    subject: Optional[str] = None
    tree_data: dict = Field(default_factory=dict)
    markmap_markdown: str = ""


class FileChapterMindmapUpdateForm(BaseModel):
    tree_data: Optional[dict] = None
    markmap_markdown: Optional[str] = None


class FileChapterMindmapsTable:
    def replace_mindmaps(
        self,
        file_id: str,
        mindmaps: List[FileChapterMindmapCreateForm],
        db: Optional[Session] = None,
    ) -> List[FileChapterMindmapModel]:
        with get_db_context(db) as db:
            try:
                db.query(FileChapterMindmap).filter_by(file_id=file_id).delete()
                db.flush()

                now = int(time.time())
                rows = []
                for item in mindmaps:
                    row = FileChapterMindmap(
                        id=str(uuid.uuid4()),
                        file_id=file_id,
                        chapter_title=item.chapter_title,
                        chapter_start_page=item.chapter_start_page,
                        chapter_end_page=item.chapter_end_page,
                        subject=item.subject,
                        tree_data=item.tree_data,
                        markmap_markdown=item.markmap_markdown,
                        created_at=now,
                        updated_at=now,
                    )
                    db.add(row)
                    rows.append(row)

                db.commit()
                return [FileChapterMindmapModel.model_validate(row) for row in rows]
            except Exception as e:
                log.exception(f"Error replacing chapter mindmaps for file {file_id}: {e}")
                db.rollback()
                return []

    def get_mindmaps_by_file_id(
        self, file_id: str, db: Optional[Session] = None
    ) -> List[FileChapterMindmapModel]:
        with get_db_context(db) as db:
            try:
                rows = (
                    db.query(FileChapterMindmap)
                    .filter_by(file_id=file_id)
                    .order_by(FileChapterMindmap.chapter_start_page.asc())
                    .all()
                )
                return [FileChapterMindmapModel.model_validate(row) for row in rows]
            except Exception as e:
                log.exception(f"Error getting chapter mindmaps for file {file_id}: {e}")
                return []

    def get_mindmap_by_id(
        self, mindmap_id: str, db: Optional[Session] = None
    ) -> Optional[FileChapterMindmapModel]:
        with get_db_context(db) as db:
            try:
                row = db.get(FileChapterMindmap, mindmap_id)
                if row:
                    return FileChapterMindmapModel.model_validate(row)
                return None
            except Exception:
                return None

    def get_mindmap_by_file_and_chapter(
        self,
        file_id: str,
        chapter_title: Optional[str] = None,
        chapter_start_page: Optional[int] = None,
        chapter_end_page: Optional[int] = None,
        db: Optional[Session] = None,
    ) -> Optional[FileChapterMindmapModel]:
        with get_db_context(db) as db:
            try:
                query = db.query(FileChapterMindmap).filter_by(file_id=file_id)

                if chapter_start_page is not None and chapter_end_page is not None:
                    row = (
                        query.filter_by(
                            chapter_start_page=chapter_start_page,
                            chapter_end_page=chapter_end_page,
                        )
                        .order_by(FileChapterMindmap.chapter_start_page.asc())
                        .first()
                    )
                    if row:
                        return FileChapterMindmapModel.model_validate(row)

                if chapter_title:
                    normalized_title = chapter_title.strip()
                    rows = query.order_by(FileChapterMindmap.chapter_start_page.asc()).all()
                    for row in rows:
                        if (row.chapter_title or "").strip() == normalized_title:
                            return FileChapterMindmapModel.model_validate(row)
                    return None

                if chapter_start_page is not None or chapter_end_page is not None:
                    return None

                row = query.order_by(FileChapterMindmap.chapter_start_page.asc()).first()
                if row:
                    return FileChapterMindmapModel.model_validate(row)
                return None
            except Exception as e:
                log.exception(
                    "Error getting chapter mindmap for file %s chapter %s: %s",
                    file_id,
                    chapter_title,
                    e,
                )
                return None

    def update_mindmap_by_id(
        self,
        mindmap_id: str,
        form_data: FileChapterMindmapUpdateForm,
        db: Optional[Session] = None,
    ) -> Optional[FileChapterMindmapModel]:
        with get_db_context(db) as db:
            try:
                row = db.get(FileChapterMindmap, mindmap_id)
                if not row:
                    return None

                if form_data.tree_data is not None:
                    row.tree_data = form_data.tree_data
                if form_data.markmap_markdown is not None:
                    row.markmap_markdown = form_data.markmap_markdown
                row.updated_at = int(time.time())

                db.commit()
                db.refresh(row)
                return FileChapterMindmapModel.model_validate(row)
            except Exception as e:
                log.exception(f"Error updating chapter mindmap {mindmap_id}: {e}")
                db.rollback()
                return None


FileChapterMindmaps = FileChapterMindmapsTable()


####################
# FileChapterHomework DB Schema (PDF 章节作业)
####################


class FileChapterHomework(Base):
    __tablename__ = "file_chapter_homework"

    id = Column(String, primary_key=True)
    file_id = Column(String, ForeignKey("file.id", ondelete="CASCADE"), nullable=False, index=True)
    chapter_title = Column(Text, nullable=False)
    chapter_start_page = Column(Integer, nullable=False)
    chapter_end_page = Column(Integer, nullable=False)
    subject = Column(String, nullable=True)
    questions = Column(JSON, nullable=False)
    answer_markdown = Column(Text, nullable=False)
    created_at = Column(BigInteger)
    updated_at = Column(BigInteger)


class FileChapterHomeworkModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_id: str
    chapter_title: str
    chapter_start_page: int
    chapter_end_page: int
    subject: Optional[str] = None
    questions: list[dict] = Field(default_factory=list)
    answer_markdown: str
    created_at: Optional[int] = None
    updated_at: Optional[int] = None


class FileChapterHomeworkCreateForm(BaseModel):
    chapter_title: str
    chapter_start_page: int
    chapter_end_page: int
    subject: Optional[str] = None
    questions: list[dict] = Field(default_factory=list)
    answer_markdown: str = ""


class FileChapterHomeworkUpdateForm(BaseModel):
    questions: Optional[list[dict]] = None
    answer_markdown: Optional[str] = None


class FileChapterHomeworksTable:
    def replace_homeworks(
        self,
        file_id: str,
        homeworks: List[FileChapterHomeworkCreateForm],
        db: Optional[Session] = None,
    ) -> List[FileChapterHomeworkModel]:
        with get_db_context(db) as db:
            try:
                db.query(FileChapterHomework).filter_by(file_id=file_id).delete()
                db.flush()

                now = int(time.time())
                rows = []
                for item in homeworks:
                    row = FileChapterHomework(
                        id=str(uuid.uuid4()),
                        file_id=file_id,
                        chapter_title=item.chapter_title,
                        chapter_start_page=item.chapter_start_page,
                        chapter_end_page=item.chapter_end_page,
                        subject=item.subject,
                        questions=item.questions,
                        answer_markdown=item.answer_markdown,
                        created_at=now,
                        updated_at=now,
                    )
                    db.add(row)
                    rows.append(row)

                db.commit()
                return [FileChapterHomeworkModel.model_validate(row) for row in rows]
            except Exception as e:
                log.exception(f"Error replacing chapter homeworks for file {file_id}: {e}")
                db.rollback()
                return []

    def get_homeworks_by_file_id(
        self, file_id: str, db: Optional[Session] = None
    ) -> List[FileChapterHomeworkModel]:
        with get_db_context(db) as db:
            try:
                rows = (
                    db.query(FileChapterHomework)
                    .filter_by(file_id=file_id)
                    .order_by(FileChapterHomework.chapter_start_page.asc())
                    .all()
                )
                return [FileChapterHomeworkModel.model_validate(row) for row in rows]
            except Exception as e:
                log.exception(f"Error getting chapter homeworks for file {file_id}: {e}")
                return []

    def get_homework_by_id(
        self, homework_id: str, db: Optional[Session] = None
    ) -> Optional[FileChapterHomeworkModel]:
        with get_db_context(db) as db:
            try:
                row = db.get(FileChapterHomework, homework_id)
                if row:
                    return FileChapterHomeworkModel.model_validate(row)
                return None
            except Exception:
                return None

    def update_homework_by_id(
        self,
        homework_id: str,
        form_data: FileChapterHomeworkUpdateForm,
        db: Optional[Session] = None,
    ) -> Optional[FileChapterHomeworkModel]:
        with get_db_context(db) as db:
            try:
                row = db.get(FileChapterHomework, homework_id)
                if not row:
                    return None

                if form_data.questions is not None:
                    row.questions = form_data.questions
                if form_data.answer_markdown is not None:
                    row.answer_markdown = form_data.answer_markdown
                row.updated_at = int(time.time())

                db.commit()
                db.refresh(row)
                return FileChapterHomeworkModel.model_validate(row)
            except Exception as e:
                log.exception(f"Error updating chapter homework {homework_id}: {e}")
                db.rollback()
                return None


FileChapterHomeworks = FileChapterHomeworksTable()


# Pragmatic table bootstrap for custom forks without an alembic migration yet.
Base.metadata.create_all(bind=engine, tables=[FileChapterMindmap.__table__])
